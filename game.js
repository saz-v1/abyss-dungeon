var TILE = 32, MAP_W = 25, MAP_H = 19;
var ROMAN = ['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
var kills = 0, wave = 1, playerHealth = 5, maxHealth = 5, invincible = false;

/* ── detect mobile ── */
var isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

/* ── virtual joystick state ── */
var joy = { active:false, dx:0, dy:0, magnitude:0, touchId:null };
var touchBtns = { slash:false, dash:false };
var prevTouchBtns = { slash:false, dash:false };

/* ── HUD helpers ── */
function setHealth(hp) {
  playerHealth = hp;
  document.getElementById('health-bar').style.width = Math.max(0, hp/maxHealth*100) + '%';
  document.getElementById('health-text').textContent = Math.max(0,hp) + ' / ' + maxHealth;
}
function setKills(n) { kills = n; document.getElementById('kill-count').textContent = n; }
function setWaveDisplay(w) { document.getElementById('wave-display').textContent = ROMAN[Math.min(w,12)] || w; }
function announceWave(w) {
  var el = document.getElementById('wave-announce');
  document.getElementById('wave-number').textContent = ROMAN[Math.min(w,12)] || w;
  el.style.transition = 'opacity .4s'; el.style.opacity = '1';
  setTimeout(function() { el.style.transition = 'opacity 1s'; el.style.opacity = '0'; }, 1800);
}
function showOverlay(title, sub) {
  document.getElementById('overlay-title').textContent = title;
  document.getElementById('overlay-sub').textContent = sub;
  document.getElementById('overlay-screen').classList.add('active');
}
function hideOverlay() { document.getElementById('overlay-screen').classList.remove('active'); }

/* ── Map generation ── */
function generateMap() {
  var map = [];
  for (var y = 0; y < MAP_H; y++) {
    map[y] = [];
    for (var x = 0; x < MAP_W; x++)
      map[y][x] = (x===0||y===0||x===MAP_W-1||y===MAP_H-1) ? 1 : (Math.random()<.4?1:0);
  }
  for (var step = 0; step < 5; step++) {
    var nm = [];
    for (var y = 0; y < MAP_H; y++) {
      nm[y] = [];
      for (var x = 0; x < MAP_W; x++) {
        if (x===0||y===0||x===MAP_W-1||y===MAP_H-1) { nm[y][x]=1; continue; }
        var nb = 0;
        for (var dy2=-1;dy2<=1;dy2++) for (var dx2=-1;dx2<=1;dx2++) {
          if (!dx2&&!dy2) continue;
          var nx=x+dx2, ny=y+dy2;
          if (nx<0||ny<0||nx>=MAP_W||ny>=MAP_H||map[ny][nx]===1) nb++;
        }
        nm[y][x] = nb>=5?1:0;
      }
    }
    map = nm;
  }
  var cx=Math.floor(MAP_W/2), cy=Math.floor(MAP_H/2);
  for (var dy=-2;dy<=2;dy++) for (var dx=-3;dx<=3;dx++) map[cy+dy][cx+dx]=0;
  return map;
}

function findOpenTile(map, avoidX, avoidY, minDist) {
  for (var i=0;i<200;i++) {
    var x=Phaser.Math.Between(2,MAP_W-3), y=Phaser.Math.Between(2,MAP_H-3);
    if (map[y][x]===0 && Phaser.Math.Distance.Between(x,y,avoidX,avoidY)>=minDist)
      return { x:x*TILE+TILE/2, y:y*TILE+TILE/2 };
  }
  return { x:MAP_W/2*TILE, y:MAP_H/2*TILE };
}

/* ── Phaser Scene ── */
class DungeonScene extends Phaser.Scene {
  constructor() { super({ key:'Dungeon' }); }

  create() {
    this.slashCD=0; this.dashCD=0; this.lastFacing=0;

    var map = generateMap();
    this.walls = this.physics.add.staticGroup();
    var gfx = this.add.graphics();
    for (var y=0;y<MAP_H;y++) {
      for (var x=0;x<MAP_W;x++) {
        var px=x*TILE, py=y*TILE;
        if (map[y][x]===1) {
          gfx.fillStyle(0x1a1a1a); gfx.fillRect(px,py,TILE,TILE);
          gfx.fillStyle(0x252525); gfx.fillRect(px+1,py+1,TILE-2,TILE-2);
          gfx.lineStyle(1,0x0d0d0d,1); gfx.strokeRect(px,py,TILE,TILE);
          var wall=this.add.zone(px+TILE/2,py+TILE/2,TILE,TILE);
          this.physics.add.existing(wall,true); this.walls.add(wall);
        } else {
          gfx.fillStyle(0x0e0e0e); gfx.fillRect(px,py,TILE,TILE);
          gfx.lineStyle(1,0x111111,.5); gfx.strokeRect(px,py,TILE,TILE);
        }
      }
    }

    var cx=Math.floor(MAP_W/2)*TILE+TILE/2, cy=Math.floor(MAP_H/2)*TILE+TILE/2;
    this.player=this.physics.add.image(cx,cy,'__DEFAULT');
    this.player.setVisible(false).setCollideWorldBounds(true).setSize(20,20);
    this.playerVis=this.add.graphics(); this.playerVis.setDepth(10); this.drawPlayer(this.playerVis);
    this.playerGlow=this.add.graphics(); this.playerGlow.setDepth(9);

    this.enemies=this.physics.add.group();
    var count=4+wave*2, mapCX=Math.floor(MAP_W/2), mapCY=Math.floor(MAP_H/2);
    for (var i=0;i<count;i++) {
      var pos=findOpenTile(map,mapCX,mapCY,6);
      var e=this.physics.add.image(pos.x,pos.y,'__DEFAULT');
      e.setVisible(false).setSize(20,20);
      e.speed=45+Math.random()*50+wave*5; e.hp=wave>=4?2:1;
      var eg=this.add.graphics(); this.drawEnemy(eg,e.hp); eg.setDepth(8); e.gfx=eg;
      this.enemies.add(e);
    }

    this.physics.add.collider(this.player,this.walls);
    this.physics.add.collider(this.enemies,this.walls);
    this.physics.add.collider(this.enemies,this.enemies);
    this.physics.add.overlap(this.player,this.enemies,function(){this.playerHit();},null,this);

    this.cursors=this.input.keyboard.createCursorKeys();
    this.dashKey=this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.slashKey=this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.regenKey=this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.wasd={
      up:   this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right:this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };

    setHealth(playerHealth); setKills(kills); setWaveDisplay(wave);
  }

  drawPlayer(g) {
    g.clear();
    g.fillStyle(0xc8c8c8); g.fillRect(-8,-8,16,16);
    g.fillStyle(0xffffff,.4); g.fillRect(-6,-8,8,3);
    g.fillStyle(0xdc143c); g.fillRect(-3,-3,6,2);
    g.lineStyle(1,0x888888); g.strokeRect(-8,-8,16,16);
  }

  drawEnemy(g,hp) {
    g.clear();
    g.fillStyle(hp>1?0x8b0000:0xcc2222); g.fillTriangle(-10,10,10,10,0,-10);
    g.lineStyle(1,0xff4444,.6); g.strokeTriangle(-10,10,10,10,0,-10);
    g.fillStyle(0xff6666,.3); g.fillTriangle(-6,6,6,6,0,-5);
  }

  doSlash(angle) {
    var reach=52;
    var sg=this.add.graphics(); sg.setDepth(15);
    sg.lineStyle(3,0xff4444,.9);
    sg.beginPath(); sg.arc(this.player.x,this.player.y,reach,angle-.7,angle+.7,false); sg.strokePath();
    sg.lineStyle(6,0xff0000,.3); sg.strokePath();
    for (var i=0;i<5;i++) {
      var a=angle-.7+(i/4)*1.4;
      var pg=this.add.graphics(); pg.fillStyle(0xff4444,.8); pg.fillCircle(0,0,2+Math.random()*3);
      pg.setPosition(this.player.x+Math.cos(a)*reach, this.player.y+Math.sin(a)*reach); pg.setDepth(16);
      this.tweens.add({targets:pg,alpha:0,scaleX:.1,scaleY:.1,duration:300,onComplete:function(t,o){o[0].destroy();}});
    }
    var hx=this.player.x+Math.cos(angle)*(reach/2), hy=this.player.y+Math.sin(angle)*(reach/2);
    var hz=this.physics.add.image(hx,hy,'__DEFAULT'); hz.setSize(reach*1.5,reach*1.5).setVisible(false);
    this.physics.overlap(hz,this.enemies,function(h,en){this.hitEnemy(en);},null,this);
    this.time.delayedCall(120,function(){sg.destroy();hz.destroy();});
  }

  hitEnemy(enemy) {
    enemy.hp--;
    if (enemy.hp<=0) this.killEnemy(enemy);
    else this.tweens.add({targets:enemy.gfx,alpha:.3,duration:80,yoyo:true});
  }

  killEnemy(enemy) {
    for (var i=0;i<8;i++) {
      var a=(i/8)*Math.PI*2, pg=this.add.graphics();
      pg.fillStyle(0xcc2222,.8); pg.fillCircle(0,0,2+Math.random()*4);
      pg.setPosition(enemy.x,enemy.y); pg.setDepth(20);
      this.tweens.add({targets:pg,
        x:enemy.x+Math.cos(a)*(20+Math.random()*30),
        y:enemy.y+Math.sin(a)*(20+Math.random()*30),
        alpha:0,scaleX:.1,scaleY:.1,duration:400+Math.random()*200,
        onComplete:function(t,o){o[0].destroy();}});
    }
    enemy.gfx.destroy(); enemy.destroy();
    setKills(kills+1);
    if (this.enemies.countActive(true)===0)
      this.time.delayedCall(1000,function(){this.nextWave();},[], this);
  }

  playerHit() {
    if (invincible) return; invincible=true;
    setHealth(playerHealth-1);
    this.tweens.add({targets:this.playerVis,alpha:.2,duration:80,yoyo:true,repeat:4,
      onComplete:function(){this.playerVis.alpha=1;}.bind(this)});
    var fl=this.add.graphics(); fl.fillStyle(0xff0000,.25); fl.fillRect(0,0,MAP_W*TILE,MAP_H*TILE); fl.setDepth(50);
    this.tweens.add({targets:fl,alpha:0,duration:300,onComplete:function(t,o){o[0].destroy();}});
    if (playerHealth<=0){this.time.delayedCall(400,function(){this.gameOver();},[], this);return;}
    this.time.delayedCall(1200,function(){invincible=false;});
  }

  nextWave() {
    wave++; maxHealth=Math.min(maxHealth+(wave%3===0?1:0),10);
    setHealth(Math.min(playerHealth+1,maxHealth)); setWaveDisplay(wave); announceWave(wave);
    this.time.delayedCall(600,function(){this.scene.restart();},[], this);
  }

  gameOver() {
    showOverlay('YOU DIED','REACHED WAVE '+(ROMAN[Math.min(wave,12)]||wave)+' \u2014 '+kills+' KILLS');
  }

  update() {
    if (!this.player||!this.player.active) return;

    var kL=this.cursors.left.isDown  ||this.wasd.left.isDown;
    var kR=this.cursors.right.isDown ||this.wasd.right.isDown;
    var kU=this.cursors.up.isDown    ||this.wasd.up.isDown;
    var kD=this.cursors.down.isDown  ||this.wasd.down.isDown;

    var jL=joy.dx<-.25, jR=joy.dx>.25, jU=joy.dy<-.25, jD=joy.dy>.25;
    var left=kL||jL, right=kR||jR, up=kU||jU, down=kD||jD;
    var spd=160;
    this.player.setVelocity(0);

    if (joy.active && joy.magnitude>.1) {
      this.player.setVelocity(joy.dx*spd, joy.dy*spd);
    } else {
      if (left)  this.player.setVelocityX(-spd);
      if (right) this.player.setVelocityX(spd);
      if (up)    this.player.setVelocityY(-spd);
      if (down)  this.player.setVelocityY(spd);
      if ((left||right)&&(up||down))
        this.player.setVelocity(this.player.body.velocity.x*.707, this.player.body.velocity.y*.707);
    }

    if      (left&&up)    this.lastFacing=-Math.PI*.75;
    else if (right&&up)   this.lastFacing=-Math.PI*.25;
    else if (left&&down)  this.lastFacing= Math.PI*.75;
    else if (right&&down) this.lastFacing= Math.PI*.25;
    else if (left)        this.lastFacing= Math.PI;
    else if (right)       this.lastFacing= 0;
    else if (up)          this.lastFacing=-Math.PI/2;
    else if (down)        this.lastFacing= Math.PI/2;
    else if (joy.active&&joy.magnitude>.1) this.lastFacing=Math.atan2(joy.dy,joy.dx);

    var slashTrig = Phaser.Input.Keyboard.JustDown(this.slashKey)
                 || (touchBtns.slash && !prevTouchBtns.slash);
    if (slashTrig && this.slashCD<=0) { this.slashCD=25; this.doSlash(this.lastFacing); }

    var dashTrig = Phaser.Input.Keyboard.JustDown(this.dashKey)
                || (touchBtns.dash && !prevTouchBtns.dash);
    if (dashTrig && this.dashCD<=0) {
      this.dashCD=70;
      var ds=480;
      if (joy.active&&joy.magnitude>.1) {
        this.player.setVelocity(joy.dx*ds, joy.dy*ds);
      } else {
        if (left)  this.player.setVelocityX(-ds);
        if (right) this.player.setVelocityX(ds);
        if (up)    this.player.setVelocityY(-ds);
        if (down)  this.player.setVelocityY(ds);
      }
      var tg=this.add.graphics(); tg.fillStyle(0x4488ff,.4); tg.fillRect(this.player.x-8,this.player.y-8,16,16); tg.setDepth(7);
      this.tweens.add({targets:tg,alpha:0,duration:200,onComplete:function(t,o){o[0].destroy();}});
    }

    if (Phaser.Input.Keyboard.JustDown(this.regenKey)) this.scene.restart();

    prevTouchBtns.slash = touchBtns.slash;
    prevTouchBtns.dash  = touchBtns.dash;

    this.enemies.children.iterate(function(e) {
      if (!e||!e.active) return;
      var a=Phaser.Math.Angle.Between(e.x,e.y,this.player.x,this.player.y);
      e.setVelocity(Math.cos(a)*e.speed, Math.sin(a)*e.speed);
      if (e.gfx) e.gfx.setPosition(e.x,e.y);
    },this);

    if (this.playerVis) this.playerVis.setPosition(this.player.x,this.player.y);
    if (this.playerGlow) {
      var t=this.time.now, al=.1+Math.sin(t*.004)*.05;
      this.playerGlow.clear(); this.playerGlow.fillStyle(0xffffff,al);
      this.playerGlow.fillCircle(this.player.x,this.player.y,18);
    }

    if (this.slashCD>0) this.slashCD--;
    if (this.dashCD>0)  this.dashCD--;
    var sf=this.slashCD/25, df=this.dashCD/70;
    document.getElementById('slash-cd').style.height = (sf*100)+'%';
    document.getElementById('dash-cd').style.height  = (df*100)+'%';
    if (isMobile) {
      document.getElementById('slash-cd-btn').style.height = (sf*100)+'%';
      document.getElementById('dash-cd-btn').style.height  = (df*100)+'%';
    }
  }
}

/* ── Phaser config ── */
var game = new Phaser.Game({
  type:Phaser.AUTO, width:MAP_W*TILE, height:MAP_H*TILE,
  backgroundColor:'#080808', parent:'phaser-canvas',
  physics:{default:'arcade',arcade:{debug:false}},
  scene:DungeonScene
});

/* ── Touch joystick ── */
function setupJoystick() {
  var zone  = document.getElementById('joystick-zone');
  var base  = document.getElementById('joystick-base');
  var thumb = document.getElementById('joystick-thumb');
  var maxR  = 42;

  function getBaseCentre() {
    var r = base.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  }

  function updateJoy(cx, cy) {
    var c = getBaseCentre();
    var dx = cx - c.x, dy = cy - c.y;
    var dist = Math.sqrt(dx*dx+dy*dy);
    var clamped = Math.min(dist, maxR);
    var nx = dist>0 ? dx/dist : 0, ny = dist>0 ? dy/dist : 0;
    joy.dx = nx; joy.dy = ny;
    joy.magnitude = Math.min(dist/maxR, 1);
    thumb.style.left = (50 + (nx*clamped/base.offsetWidth)*100) + '%';
    thumb.style.top  = (50 + (ny*clamped/base.offsetHeight)*100) + '%';
  }

  zone.addEventListener('touchstart', function(e) {
    e.preventDefault();
    var touch = e.changedTouches[0];
    joy.touchId = touch.identifier; joy.active = true;
    thumb.classList.add('active');
    updateJoy(touch.clientX, touch.clientY);
  }, {passive:false});

  zone.addEventListener('touchmove', function(e) {
    e.preventDefault();
    for (var i=0;i<e.changedTouches.length;i++) {
      if (e.changedTouches[i].identifier === joy.touchId)
        updateJoy(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
    }
  }, {passive:false});

  zone.addEventListener('touchend', function(e) {
    e.preventDefault();
    for (var i=0;i<e.changedTouches.length;i++) {
      if (e.changedTouches[i].identifier === joy.touchId) {
        joy.active=false; joy.dx=0; joy.dy=0; joy.magnitude=0; joy.touchId=null;
        thumb.classList.remove('active');
        thumb.style.left='50%'; thumb.style.top='50%';
      }
    }
  }, {passive:false});
}

/* ── Touch action buttons ── */
function setupActionButtons() {
  function bindBtn(id, key) {
    var el = document.getElementById(id);
    el.addEventListener('touchstart',  function(e){ e.preventDefault(); touchBtns[key]=true;  el.classList.add('pressed');    },{passive:false});
    el.addEventListener('touchend',    function(e){ e.preventDefault(); touchBtns[key]=false; el.classList.remove('pressed'); },{passive:false});
    el.addEventListener('touchcancel', function(e){ e.preventDefault(); touchBtns[key]=false; el.classList.remove('pressed'); },{passive:false});
  }
  bindBtn('btn-slash','slash');
  bindBtn('btn-dash','dash');
}

/* ── Game flow ── */
var gameStarted = false;

function startGame() {
  if (gameStarted) return; gameStarted=true;
  var ts=document.getElementById('title-screen');
  ts.style.animation='fadeOut .5s ease forwards';
  setTimeout(function(){ts.style.display='none';},500);
  document.getElementById('hud').classList.add('visible');
  if (isMobile) {
    document.getElementById('touch-controls').classList.add('visible');
    setupJoystick();
    setupActionButtons();
  }
  wave=1; kills=0; playerHealth=5; maxHealth=5; invincible=false;
  announceWave(1);
}

function restartGame() {
  hideOverlay(); gameStarted=true;
  wave=1; kills=0; playerHealth=5; maxHealth=5; invincible=false;
  setHealth(5); setKills(0); setWaveDisplay(1);
  game.scene.getScene('Dungeon').scene.restart();
  announceWave(1);
}

/* ── Init ── */
if (isMobile) {
  document.getElementById('desktop-controls').style.display='none';
  document.getElementById('mobile-controls').style.display='grid';
  document.getElementById('begin-hint').textContent='TAP TO BEGIN';
} else {
  document.getElementById('begin-hint').textContent='PRESS ANY KEY TO BEGIN';
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('title-screen').addEventListener('click', startGame);
document.getElementById('title-screen').addEventListener('touchend', startGame);
document.getElementById('overlay-btn').addEventListener('click', restartGame);
document.getElementById('overlay-btn').addEventListener('touchend', restartGame);
document.addEventListener('keydown', startGame);
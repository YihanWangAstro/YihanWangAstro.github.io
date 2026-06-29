// research-landscape.js — per-theme canvas animations. Always loop; paused when off-screen.
(function(){
  var __gatedRAF = function(canvas){
    var visible = true, pending = null;
    var raf = (window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function(cb){ return setTimeout(function(){ cb(Date.now()); }, 16); });
    try { var io = new IntersectionObserver(function(es){ var v=es[0].isIntersecting; if(v&&!visible&&pending){var cb=pending;pending=null;raf(cb);} visible=v; }, {threshold:0}); io.observe(canvas); } catch(e){ visible=true; }
    return function(cb){ if(visible) return raf(cb); pending=cb; return 0; };
  };
  var INIT = {};
  INIT[1] = function(canvas){
  var requestAnimationFrame = __gatedRAF(canvas);
  var ctx=canvas.getContext('2d'), w=1,h=1,dpr=1;
  function resize(){ dpr=Math.min(window.devicePixelRatio||1,2); var r=canvas.getBoundingClientRect(); w=Math.max(1,r.width); h=Math.max(1,r.height); canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); }
  resize(); window.addEventListener('resize', resize);

  // ---- palette ----
  var COL_GREEN='#39d353', COL_AMBER='#f0a500', COL_WHITE='#e6edf3', COL_MUTE='#9aa4b2', COL_BG='#0d1117';

  // ---- helpers ----
  function clamp(x,a,b){ return x<a?a:(x>b?b:x); }
  function smooth(e0,e1,x){ var t=clamp((x-e0)/(e1-e0),0,1); return t*t*(3-2*t); }
  function lerp(a,b,t){ return a+(b-a)*t; }
  // hash-based deterministic pseudo-random for stable per-object params
  function hash(n){ var s=Math.sin(n*127.1+311.7)*43758.5453; return s-Math.floor(s); }

  // disk geometry constants (in S units)
  var INCL=0.40;            // vertical squash -> ~36 deg inclination feel
  var R_IN=0.155, R_OUT=0.46; // disk radii
  var BH_R=0.115;           // black-hole shadow radius

  // captured-star population (Phase 1)
  var STARS=[];
  (function(){
    for(var i=0;i<7;i++){
      var seed=i+1;
      STARS.push({
        a0: lerp(0.34,0.46, hash(seed*3.1)),     // initial semi-major
        ecc0: lerp(0.45,0.72, hash(seed*5.7)),   // initial eccentricity
        inc0: lerp(0.7,1.25, hash(seed*7.3))*(hash(seed*2.2)<0.5?1:-1), // initial inclination (radians-ish tilt)
        node: hash(seed*9.9)*Math.PI*2,          // ascending node angle
        phase: hash(seed*11.4)*Math.PI*2,        // orbital phase
        speed: lerp(0.9,1.5, hash(seed*13.2)),   // angular speed
        isBH: hash(seed*4.4)<0.3,                // some are stellar BHs
        settle: lerp(6.0,16.0, hash(seed*6.1))   // time(s) to settle into plane
      });
    }
  })();

  // tiny static starfield (deterministic at setup)
  var FIELD=[];
  (function(){ for(var i=0;i<46;i++){ FIELD.push({x:Math.random(), y:Math.random(), b:0.25+Math.random()*0.6, tw:Math.random()*6.28}); } })();

  var start=null;

  // ---- background ----
  function drawBG(t){
    ctx.fillStyle=COL_BG; ctx.fillRect(0,0,w,h);
    for(var i=0;i<FIELD.length;i++){
      var s=FIELD[i];
      var a=s.b*(0.5+0.5*Math.sin(t*0.8+s.tw));
      ctx.globalAlpha=a*0.5;
      ctx.fillStyle=COL_WHITE;
      ctx.fillRect(s.x*w, s.y*h, 1, 1);
    }
    ctx.globalAlpha=1;
  }

  // ---- the accretion disk : the centerpiece ----
  // bright param scales overall luminosity (Phase 2 brightening), tint shifts hue toward red (Phase 3 flare unaffected)
  function drawDisk(cx,cy,S,t,bright){
    var rin=R_IN*S, rout=R_OUT*S, bhr=BH_R*S;
    var sq=INCL;               // vertical squash -> inclination (~36 deg)
    var rot=t*0.55;            // slow disk rotation (drives turbulence drift)

    // Draw the disk as ONE continuous smooth elliptical surface (radial gradients
    // in a (1, sq) scaled space). The only occluder is the round BH shadow: we
    // paint the full disk, then the shadow on top, then redraw just the near-side
    // crescent that passes in front of the lower shadow. No horizontal seam.

    // --- base radial color gradient: white-hot inner -> amber -> dim-red outer ---
    function baseGrad(){
      // gradient defined in scaled space: radius rin..rout from center
      var g=ctx.createRadialGradient(0,0,bhr*0.96, 0,0,rout);
      var b=clamp(bright,0,3);
      g.addColorStop(0.00,'rgba(255,252,246,'+clamp(0.95*b,0,1).toFixed(3)+')'); // white-hot
      g.addColorStop(0.16,'rgba(255,236,198,'+clamp(0.95*b,0,1).toFixed(3)+')');
      g.addColorStop(0.38,'rgba(248,176,52,'+clamp(0.80*b,0,1).toFixed(3)+')');  // amber/orange
      g.addColorStop(0.66,'rgba(208,96,18,'+clamp(0.46*b,0,1).toFixed(3)+')');
      g.addColorStop(0.86,'rgba(150,40,18,'+clamp(0.20*b,0,1).toFixed(3)+')');   // dim red
      g.addColorStop(1.00,'rgba(110,24,14,0)');
      return g;
    }

    // paint the full continuous annular surface (no half-plane clip).
    // Assumes ctx already translated to (cx,cy) and scaled (1,sq).
    function paintSurface(){
      // main surface
      ctx.fillStyle=baseGrad();
      ctx.beginPath(); ctx.arc(0,0,rout,0,Math.PI*2); ctx.fill();

      // punch out the inner hole so the surface is a clean annulus (smooth edge)
      ctx.globalCompositeOperation='destination-out';
      var hole=ctx.createRadialGradient(0,0,0, 0,0,rin*1.02);
      hole.addColorStop(0,'rgba(0,0,0,1)');
      hole.addColorStop(0.82,'rgba(0,0,0,1)');
      hole.addColorStop(1,'rgba(0,0,0,0)'); // soft feather, no hard ring
      ctx.fillStyle=hole;
      ctx.beginPath(); ctx.arc(0,0,rin*1.02,0,Math.PI*2); ctx.fill();
      ctx.globalCompositeOperation='source-over';

      // --- Doppler asymmetry: brighten right half, dim left half (smooth) ---
      ctx.globalCompositeOperation='lighter';
      var dop=ctx.createLinearGradient(-rout,0, rout,0);
      dop.addColorStop(0,'rgba(255,210,140,0)');
      dop.addColorStop(0.55,'rgba(255,210,150,0)');
      dop.addColorStop(1,'rgba(255,224,170,'+clamp(0.28*bright,0,1).toFixed(3)+')'); // right brighter
      ctx.fillStyle=dop;
      ctx.beginPath(); ctx.arc(0,0,rout,0,Math.PI*2); ctx.fill();

      ctx.globalCompositeOperation='source-over';
      var dim=ctx.createLinearGradient(-rout,0, rout,0);
      dim.addColorStop(0,'rgba(13,17,23,'+clamp(0.32,0,1).toFixed(3)+')'); // left receding, dimmer
      dim.addColorStop(0.45,'rgba(13,17,23,0)');
      dim.addColorStop(1,'rgba(13,17,23,0)');
      ctx.save();
      // restrict the dimming to the annulus so it doesn't darken the background
      ctx.beginPath(); ctx.arc(0,0,rout,0,Math.PI*2);
      ctx.arc(0,0,rin*0.98,0,Math.PI*2,true);
      ctx.clip('evenodd');
      ctx.fillStyle=dim;
      ctx.beginPath(); ctx.arc(0,0,rout,0,Math.PI*2); ctx.fill();
      ctx.restore();

      // --- smooth turbulent flicker: a few large soft drifting blobs (no grid) ---
      ctx.globalCompositeOperation='lighter';
      for(var bI=0;bI<5;bI++){
        var ph=bI*1.7;
        var ang=rot*0.9 + ph + Math.sin(t*0.5+ph)*0.6;
        var rad=lerp(rin*1.25,rout*0.9, 0.2+0.6*(0.5+0.5*Math.sin(t*0.37+ph*1.3)));
        var bxp=Math.cos(ang)*rad, byp=Math.sin(ang)*rad;
        var amp=(0.05+0.05*(0.5+0.5*Math.sin(t*1.9+ph*2.1)))*bright;
        var br=rout*0.34;
        var tg=ctx.createRadialGradient(bxp,byp,0, bxp,byp,br);
        tg.addColorStop(0,'rgba(255,206,120,'+clamp(amp,0,1).toFixed(3)+')');
        tg.addColorStop(1,'rgba(255,160,40,0)');
        ctx.fillStyle=tg;
        ctx.beginPath(); ctx.arc(bxp,byp,br,0,Math.PI*2); ctx.fill();
      }
      ctx.globalCompositeOperation='source-over';
    }

    // 1) FULL continuous disk surface (one piece -> no horizontal seam)
    ctx.save();
    ctx.translate(cx,cy); ctx.scale(1,sq);
    paintSurface();
    ctx.restore();

    // 2) black-hole shadow disc on top (occludes the far side directly behind it)
    ctx.save();
    ctx.beginPath(); ctx.arc(cx,cy,bhr,0,Math.PI*2);
    ctx.fillStyle=COL_BG; ctx.fill();
    // thin bright photon-ring edge
    ctx.lineWidth=2.0;
    ctx.shadowColor=COL_AMBER; ctx.shadowBlur=10*clamp(bright,0,2);
    ctx.strokeStyle='rgba(255,232,184,'+clamp(0.9*bright,0,1).toFixed(3)+')';
    ctx.beginPath(); ctx.arc(cx,cy,bhr,0,Math.PI*2); ctx.stroke();
    ctx.shadowBlur=0;
    ctx.restore();

    // 3) redraw ONLY the near-side crescent of the disk that passes in FRONT of
    //    the lower part of the shadow. Clip to the shadow disc, redraw the disk,
    //    then mask the upper (far) portion with a SOFT vertical alpha falloff so
    //    there is no straight horizontal edge anywhere.
    ctx.save();
    // clip region = inside the BH shadow circle (a curved boundary, no straight edge)
    ctx.beginPath(); ctx.arc(cx,cy,bhr*1.02,0,Math.PI*2); ctx.clip();
    // redraw the continuous disk surface within the shadow region
    ctx.save();
    ctx.translate(cx,cy); ctx.scale(1,sq);
    paintSurface();
    ctx.restore();
    // soft vertical alpha falloff: erase the upper (far) portion smoothly, keep the
    // lower near rim. Feathered over a band -> no hard horizontal line.
    ctx.globalCompositeOperation='destination-out';
    var occ=ctx.createLinearGradient(0, cy-bhr*1.1, 0, cy+bhr*0.35);
    occ.addColorStop(0.00,'rgba(0,0,0,1)');   // top: fully removed (far side behind hole)
    occ.addColorStop(0.62,'rgba(0,0,0,1)');
    occ.addColorStop(1.00,'rgba(0,0,0,0)');   // toward bottom: keep the near rim
    ctx.fillStyle=occ;
    ctx.fillRect(cx-bhr*1.2, cy-bhr*1.2, bhr*2.4, bhr*2.4);
    ctx.globalCompositeOperation='source-over';
    ctx.restore();

    // 4) hot inner-edge glow hugging the shadow (smooth elliptical radial)
    ctx.save();
    ctx.translate(cx,cy); ctx.scale(1,sq);
    ctx.globalCompositeOperation='lighter';
    var ig=ctx.createRadialGradient(0,0,bhr*0.9, 0,0,rin*1.7);
    ig.addColorStop(0,'rgba(255,250,240,'+clamp(0.55*bright,0,1).toFixed(3)+')');
    ig.addColorStop(0.5,'rgba(255,200,120,'+clamp(0.30*bright,0,1).toFixed(3)+')');
    ig.addColorStop(1,'rgba(240,165,0,0)');
    ctx.fillStyle=ig;
    ctx.beginPath(); ctx.arc(0,0,rin*1.7,0,Math.PI*2); ctx.fill();
    ctx.restore();

    // 5) subtle outer overall glow halo
    ctx.save();
    ctx.translate(cx,cy); ctx.scale(1,sq);
    ctx.globalCompositeOperation='lighter';
    var og=ctx.createRadialGradient(0,0,rin, 0,0,rout*1.28);
    og.addColorStop(0,'rgba(240,165,0,0)');
    og.addColorStop(0.7,'rgba(240,140,30,'+clamp(0.06*bright,0,1).toFixed(3)+')');
    og.addColorStop(1,'rgba(120,30,10,0)');
    ctx.fillStyle=og;
    ctx.beginPath(); ctx.arc(0,0,rout*1.28,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // map a point at angle th, radius r (S-units) on the disk plane to screen
  function diskPt(cx,cy,S,th,r){ return [cx+Math.cos(th)*r*S, cy+Math.sin(th)*r*S*INCL]; }

  // ---- Phase 1: disk capture ----
  function drawCapture(cx,cy,S,lt){
    // progress of capture across the phase (0..1)
    for(var i=0;i<STARS.length;i++){
      var st=STARS[i];
      var p=clamp(lt/st.settle,0,1);            // settle progress
      var ease=smooth(0,1,p);
      var a=lerp(st.a0, R_IN*1.0+0.06, ease);   // semi-major shrinks toward inner disk
      var ecc=lerp(st.ecc0, 0.04, ease);        // circularizes
      var inc=lerp(st.inc0, 0.0, ease);         // inclination damps to plane
      var th=st.phase + lt*st.speed*(1.0+ (1-ease)*0.3);
      // eccentric orbit radius
      var rr=a*(1-ecc*ecc)/(1+ecc*Math.cos(th));
      // position in orbital plane then tilt by inc around node line
      var ox=Math.cos(th)*rr, oy=Math.sin(th)*rr;
      // rotate by node
      var cn=Math.cos(st.node), sn=Math.sin(st.node);
      var px=ox*cn - oy*sn;
      var py=ox*sn + oy*cn;
      // inclination: tilt the y of the orbit (out-of-plane) -> add vertical offset that crosses zero each orbit
      var outZ=Math.sin(th)*Math.sin(inc)*rr; // out-of-plane component
      // screen: disk plane gets INCL squash; out-of-plane adds vertical
      var sx=cx + px*S;
      var sy=cy + py*S*INCL - outZ*S*0.85;

      // crossing flash: when |outZ| small and moving through plane -> dissipation spark
      var crossing = 1.0 - clamp(Math.abs(outZ)/(0.05),0,1);
      var flash = crossing*(1-ease)*0.9;

      // object color: green for stars, amber for BHs
      var col = st.isBH? COL_AMBER : COL_GREEN;
      var sz = st.isBH? 2.6 : 2.2;

      // trailing tail along orbit
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      for(var k=1;k<=6;k++){
        var thb=th - k*0.10*st.speed;
        var rrb=a*(1-ecc*ecc)/(1+ecc*Math.cos(thb));
        var oxb=Math.cos(thb)*rrb, oyb=Math.sin(thb)*rrb;
        var pxb=oxb*cn-oyb*sn, pyb=oxb*sn+oyb*cn;
        var outZb=Math.sin(thb)*Math.sin(inc)*rrb;
        var bx=cx+pxb*S, by=cy+pyb*S*INCL - outZb*S*0.85;
        ctx.globalAlpha=0.18*(1-k/7);
        ctx.fillStyle=col;
        ctx.beginPath(); ctx.arc(bx,by, sz*(1-k/9), 0,Math.PI*2); ctx.fill();
      }
      ctx.restore();

      // crossing dissipation spark
      if(flash>0.02){
        ctx.save();
        ctx.globalCompositeOperation='lighter';
        ctx.shadowColor=COL_WHITE; ctx.shadowBlur=8*flash;
        ctx.globalAlpha=flash;
        ctx.fillStyle=COL_WHITE;
        ctx.beginPath(); ctx.arc(sx,sy, sz+2.4*flash, 0,Math.PI*2); ctx.fill();
        ctx.restore();
      }

      // the object
      ctx.save();
      ctx.shadowColor=col; ctx.shadowBlur=6;
      ctx.fillStyle = st.isBH? '#1b1f27' : col;
      ctx.beginPath(); ctx.arc(sx,sy, sz, 0,Math.PI*2); ctx.fill();
      if(st.isBH){ ctx.strokeStyle=col; ctx.lineWidth=1.1; ctx.stroke(); }
      ctx.restore();
    }
  }

  // ---- Phase 2: changing-look TDE ----
  // returns extra disk brightness contributed this phase
  function drawTDE(cx,cy,S,lt){
    // timeline within phase (0..20)
    var streamGrow=smooth(0.0,7.0,lt);       // stream wraps in
    var feed=smooth(5.0,9.0,lt);             // begins feeding disk
    // brightening rise then fade
    var rise=smooth(6.0,11.0,lt);
    var fade=1.0-smooth(13.0,19.5,lt);
    var flareAmp=rise*fade;

    // a captured star that gets disrupted: comes from upper-left, stream spirals into inner disk
    var srcTh=2.6, srcR=R_OUT*1.15;
    // thin curved tidal stream: parametric inspiral
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    var turns=2.4;
    var N=70;
    ctx.lineWidth=2.0;
    for(var pass=0;pass<2;pass++){
      ctx.beginPath();
      var startedPt=false;
      for(var i=0;i<=N;i++){
        var u=i/N;                       // 0 outer .. 1 inner
        var vis = clamp((streamGrow- u)*2.0,0,1); // grows inward over time
        if(vis<=0) continue;
        var th = srcTh + u*turns*Math.PI*2 + lt*0.25;
        var r = lerp(srcR, R_IN*1.02, u);
        // gentle out-of-plane sag early, flattening to plane
        var sag = (1-u)*0.05*Math.sin(u*6.0)*(1-streamGrow*0.6);
        var pt=diskPt(cx,cy,S,th,r);
        var x=pt[0], y=pt[1]-sag*S;
        if(!startedPt){ ctx.moveTo(x,y); startedPt=true; } else ctx.lineTo(x,y);
      }
      var w0= pass===0? 3.2 : 1.4;
      ctx.lineWidth=w0;
      ctx.strokeStyle= pass===0? 'rgba(255,200,120,'+(0.35*streamGrow).toFixed(3)+')' : 'rgba(255,255,240,'+(0.5*streamGrow).toFixed(3)+')';
      ctx.shadowColor=COL_AMBER; ctx.shadowBlur= pass===0? 8:0;
      ctx.stroke();
      ctx.shadowBlur=0;
    }
    ctx.restore();

    // the doomed star head travelling along the stream (until disrupted)
    var headU=clamp(streamGrow,0,1);
    if(headU<0.96){
      var th=srcTh + headU*turns*Math.PI*2 + lt*0.25;
      var r=lerp(srcR,R_IN*1.02,headU);
      var hp=diskPt(cx,cy,S,th,r);
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.shadowColor=COL_WHITE; ctx.shadowBlur=7;
      ctx.fillStyle=COL_WHITE; ctx.globalAlpha=1-headU*0.4;
      ctx.beginPath(); ctx.arc(hp[0],hp[1], lerp(3.0,1.2,headU),0,Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // bright feeding hot-spot where stream meets inner disk
    if(feed>0.01){
      var fp=diskPt(cx,cy,S, srcTh + turns*Math.PI*2 + lt*0.25, R_IN*1.05);
      var g=ctx.createRadialGradient(fp[0],fp[1],0, fp[0],fp[1], 0.14*S);
      g.addColorStop(0,'rgba(255,255,245,'+(0.8*flareAmp).toFixed(3)+')');
      g.addColorStop(0.4,'rgba(255,190,90,'+(0.5*flareAmp).toFixed(3)+')');
      g.addColorStop(1,'rgba(240,140,0,0)');
      ctx.save(); ctx.globalCompositeOperation='lighter';
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(fp[0],fp[1],0.14*S,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }

    return flareAmp; // feeds into disk brightness
  }

  // ---- Phase 3: micro-TDE around embedded stellar-mass BH ----
  function drawMicroTDE(cx,cy,S,lt){
    // off-center embedded BH location on the disk plane
    var bhTh=5.1 + lt*0.10;          // slowly orbits
    var bhR=R_OUT*0.72;
    var bp=diskPt(cx,cy,S,bhTh,bhR);
    var bx=bp[0], by=bp[1];

    // an incoming star is partially peeled
    var approach=smooth(0.0,6.0,lt);
    var flare=smooth(4.0,8.0,lt)*(1.0-smooth(12.0,19.0,lt)); // modest redder flare
    // star approaches the small BH then a fraction is stripped
    var starTh=bhTh+0.9 - approach*0.9;
    var starR=bhR + (1-approach)*0.10;
    var spt=diskPt(cx,cy,S,starTh,starR);

    ctx.save();
    // small redder flare around the off-center BH
    if(flare>0.01){
      var g=ctx.createRadialGradient(bx,by,0, bx,by, 0.10*S);
      g.addColorStop(0,'rgba(255,210,150,'+(0.7*flare).toFixed(3)+')');
      g.addColorStop(0.45,'rgba(240,120,40,'+(0.5*flare).toFixed(3)+')');
      g.addColorStop(1,'rgba(180,40,20,0)');
      ctx.globalCompositeOperation='lighter';
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(bx,by,0.10*S,0,Math.PI*2); ctx.fill();
    }

    // small partial-disruption stream from star toward BH ('peeled')
    if(approach>0.2){
      ctx.globalCompositeOperation='lighter';
      ctx.beginPath();
      var M=24;
      for(var i=0;i<=M;i++){
        var u=i/M;
        var th=lerp(starTh,bhTh,u) + Math.sin(u*4+lt)*0.04;
        var r=lerp(starR,bhR,u);
        var p=diskPt(cx,cy,S,th,r);
        if(i===0) ctx.moveTo(p[0],p[1]); else ctx.lineTo(p[0],p[1]);
      }
      ctx.lineWidth=1.6;
      ctx.strokeStyle='rgba(255,170,80,'+(0.55*flare+0.15).toFixed(3)+')';
      ctx.shadowColor=COL_AMBER; ctx.shadowBlur=5;
      ctx.stroke();
      ctx.shadowBlur=0;
    }
    ctx.restore();

    // the embedded stellar-mass BH (small dark dot with thin ring)
    ctx.save();
    ctx.fillStyle='#12161d';
    ctx.beginPath(); ctx.arc(bx,by, 3.0,0,Math.PI*2); ctx.fill();
    ctx.lineWidth=1.0; ctx.strokeStyle='rgba(255,200,140,0.9)'; ctx.stroke();
    ctx.restore();

    // the surviving (partially peeled) star
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.shadowColor=COL_GREEN; ctx.shadowBlur=5;
    ctx.fillStyle=COL_GREEN; ctx.globalAlpha=1-approach*0.3;
    ctx.beginPath(); ctx.arc(spt[0],spt[1], lerp(2.6,1.8,approach),0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // ---- phase label ----
  function label(txt, fade){
    ctx.save();
    ctx.globalAlpha=clamp(fade,0,1);
    ctx.fillStyle=COL_MUTE;
    ctx.font='10px -apple-system,Segoe UI,Helvetica,Arial,sans-serif';
    ctx.textBaseline='bottom';
    ctx.fillText(txt, 8, h-7);
    ctx.restore();
  }

  function frame(ts){
    if(start==null)start=ts;
    var t=(ts-start)/1000;
    if(w<2||h<2){ requestAnimationFrame(frame); return; }

    var T=60, lt=t%T;
    var cx=w/2, cy=h/2, S=Math.min(w,h);

    drawBG(t);

    // phase windows with cross-fade
    var XF=2.0; // crossfade seconds
    // base disk brightness; Phase 2 boosts it
    var bright=1.0;

    // compute phase fades
    var p1 = 1.0 - smooth(20-XF,20,lt);                 // 0..20 fading out near 20
    var p2 = smooth(20-XF,20,lt) - smooth(40-XF,40,lt); // 20..40
    var p3 = smooth(40-XF,40,lt) - smooth(60-XF,60,lt) + smooth(0, XF, lt)*0.0; // 40..60
    // ensure p3 fades out at the very end and p1 fades in at very start
    p1 = clamp(p1,0,1); p2=clamp(p2,0,1); p3=clamp(p3,0,1);
    // wrap fade-out of phase3 near 60 handled; fade-in of phase1 near 0
    var startFade=smooth(0,XF,lt);
    if(lt>60-XF){ var endf=1-smooth(60-XF,60,lt); p3*=1; }

    // Phase 2 brightening of the disk
    var tdeFlare=0;
    if(p2>0.001){ /* compute later, need lt local */ }

    // ---- draw disk (always present) ----
    // determine brightness boost from TDE phase
    if(p2>0.001){
      // peek tde flare amplitude for brightness (recompute lightweight)
      var lt2=lt-20;
      var riseB=smooth(6.0,11.0,lt2);
      var fadeB=1.0-smooth(13.0,19.5,lt2);
      tdeFlare=riseB*fadeB;
    }
    bright = 1.0 + tdeFlare*1.4*p2;        // dramatic brightening during phase 2
    // slight overall flicker
    bright *= 0.94+0.06*Math.sin(t*5.0)*Math.cos(t*2.3);

    drawDisk(cx,cy,S,t,bright);

    // ---- phase content ----
    if(p1>0.003){
      ctx.save(); ctx.globalAlpha=p1*startFade;
      drawCapture(cx,cy,S,lt);
      ctx.restore();
    }
    if(p2>0.003){
      ctx.save(); ctx.globalAlpha=p2;
      drawTDE(cx,cy,S,lt-20);
      ctx.restore();
    }
    if(p3>0.003){
      ctx.save(); ctx.globalAlpha=p3;
      drawMicroTDE(cx,cy,S,lt-40);
      ctx.restore();
    }

    // ---- label (pick dominant phase) ----
    if(p2>=p1 && p2>=p3) label('CHANGING-LOOK TDE', p2);
    else if(p3>=p1 && p3>=p2) label('MICRO-TDE', p3);
    else label('DISK CAPTURE', p1);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};
  INIT[2] = function(canvas){
  var requestAnimationFrame = __gatedRAF(canvas);
  var ctx=canvas.getContext('2d'), w=1,h=1,dpr=1;
  function resize(){ dpr=Math.min(window.devicePixelRatio||1,2); var r=canvas.getBoundingClientRect(); w=Math.max(1,r.width); h=Math.max(1,r.height); canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); }
  resize(); window.addEventListener('resize', resize);
  var TAU=Math.PI*2;
  var stars=[];
  for(var i=0;i<60;i++){ stars.push({x:Math.random(),y:Math.random(),r:Math.random()*0.9+0.2,tw:Math.random()*TAU}); }
  var COL={green:'#39d353',gold:'#f0a500',white:'#e6edf3',muted:'#9aa4b2'};
  function lerp(a,b,u){ return a+(b-a)*u; }
  function clamp(x,a,b){ return x<a?a:(x>b?b:x); }
  function smooth(u){ u=clamp(u,0,1); return u*u*(3-2*u); }
  function envelope(p,fin,fout){ var a=smooth(p/fin); var b=smooth((1-p)/fout); return Math.min(a,b); }
  function dot(x,y,r,col,glow){ if(glow){ ctx.shadowColor=col; ctx.shadowBlur=glow; } ctx.fillStyle=col; ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill(); if(glow) ctx.shadowBlur=0; }
  function orbitPath(fx,fy,a,e,rot,alpha,col){ var b=a*Math.sqrt(1-e*e); var cx=fx - a*e*Math.cos(rot); var cy=fy - a*e*Math.sin(rot); ctx.save(); ctx.globalAlpha=alpha; ctx.strokeStyle=col; ctx.lineWidth=1; ctx.translate(cx,cy); ctx.rotate(rot); ctx.beginPath(); ctx.ellipse(0,0,a,b,0,0,TAU); ctx.stroke(); ctx.restore(); }
  function label(txt,a){ ctx.save(); ctx.globalAlpha=a*0.9; ctx.fillStyle=COL.muted; ctx.font='600 10px ui-monospace,Menlo,monospace'; ctx.textAlign='left'; ctx.textBaseline='top'; ctx.fillText(txt,10,10); ctx.restore(); }
  function drawStars(t){ ctx.save(); for(var i=0;i<stars.length;i++){ var s=stars[i]; var a=0.25+0.25*Math.sin(t*1.3+s.tw); ctx.globalAlpha=a*0.6; ctx.fillStyle=COL.white; ctx.beginPath(); ctx.arc(s.x*w,s.y*h,s.r,0,TAU); ctx.fill(); } ctx.restore(); }
  var start=null;
  function frame(ts){ if(start==null)start=ts; var t=(ts-start)/1000;
    if(w<2||h<2){ requestAnimationFrame(frame); return; }
    var T=60, lt=t%T;
    ctx.fillStyle='#0d1117'; ctx.fillRect(0,0,w,h);
    drawStars(t);
    var cx=w/2, cy=h/2, S=Math.min(w,h);
    if(lt<23){
      var p=lt/22;
      var env=envelope(clamp(lt/22,0,1),0.08,0.06);
      ctx.save(); ctx.globalAlpha=env;
      var mergeP=0.86; var merged = p>mergeP;
      var koOsc = 0.5-0.5*Math.cos(p*TAU*3.0);
      var growth = lerp(0.55,0.97,smooth(p));
      var ecc = lerp(0.2, growth, koOsc); ecc=clamp(ecc,0.05,0.97);
      var outA=S*0.40; var oth= p*TAU*1.2;
      ctx.save(); ctx.globalAlpha=env*0.5; ctx.strokeStyle=COL.muted; ctx.lineWidth=1; ctx.translate(cx,cy); ctx.rotate(-0.5); ctx.beginPath(); ctx.ellipse(0,0,outA,outA*0.42,0,0,TAU); ctx.stroke(); ctx.restore();
      var tx=cx+Math.cos(-0.5)*(outA*Math.cos(oth)) - Math.sin(-0.5)*(outA*0.42*Math.sin(oth));
      var ty=cy+Math.sin(-0.5)*(outA*Math.cos(oth)) + Math.cos(-0.5)*(outA*0.42*Math.sin(oth));
      dot(tx,ty,S*0.034,'#1b2230',0);
      ctx.save(); ctx.globalAlpha=env*0.55; dot(tx,ty,S*0.045,COL.gold,8); ctx.restore();
      dot(tx,ty,S*0.030,'#0d1117',0);
      ctx.save(); ctx.globalAlpha=env; ctx.strokeStyle=COL.gold; ctx.lineWidth=1.4; ctx.beginPath(); ctx.arc(tx,ty,S*0.030,0,TAU); ctx.stroke(); ctx.restore();
      var prec = p*TAU*0.8; var ibx=cx - S*0.02, iby=cy + S*0.02; var innA=S*0.16;
      if(!merged){
        orbitPath(ibx,iby,innA,ecc,prec,env*0.7,COL.green);
        var spd = 6.0/Math.max(0.15,(1-ecc)); var th = p*TAU*spd; var b=innA*Math.sqrt(1-ecc*ecc);
        var ce_x=ibx - innA*ecc*Math.cos(prec); var ce_y=iby - innA*ecc*Math.sin(prec);
        var ex=Math.cos(th)*innA, ey=Math.sin(th)*b;
        var rx1=ce_x+Math.cos(prec)*ex-Math.sin(prec)*ey; var ry1=ce_y+Math.sin(prec)*ex+Math.cos(prec)*ey;
        var rx2b=2*ce_x-rx1, ry2b=2*ce_y-ry1;
        dot(rx1,ry1,S*0.018,COL.white,7); dot(rx2b,ry2b,S*0.018,COL.white,7);
        if(ecc>0.9){ ctx.save(); ctx.globalAlpha=env*(ecc-0.9)*8; dot(ibx,iby,S*0.01,COL.gold,12); ctx.restore(); }
        ctx.save(); ctx.globalAlpha=env*0.6; ctx.fillStyle=COL.muted; ctx.font='9px ui-monospace,monospace'; ctx.textAlign='right'; ctx.textBaseline='bottom'; ctx.fillText('e='+ecc.toFixed(2),w-10,h-10); ctx.restore();
      } else {
        var mp=(p-mergeP)/(1-mergeP); var flash=Math.exp(-mp*6);
        ctx.save(); ctx.globalAlpha=env*flash; dot(ibx,iby,S*0.05*(0.5+flash),COL.white,30); dot(ibx,iby,S*0.10*flash,COL.gold,40); ctx.restore();
        for(var ri=0;ri<3;ri++){ var rr=S*0.04+mp*S*0.18 + ri*S*0.03; ctx.save(); ctx.globalAlpha=env*flash*0.6/(ri+1); ctx.strokeStyle=COL.gold; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(ibx,iby,rr,0,TAU); ctx.stroke(); ctx.restore(); }
        dot(ibx,iby,S*0.02,'#0d1117',0);
        ctx.save(); ctx.globalAlpha=env; ctx.strokeStyle=COL.white; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(ibx,iby,S*0.02,0,TAU); ctx.stroke(); ctx.restore();
      }
      ctx.restore();
      label('LIDOV–KOZAI ECCENTRIC MERGER',env);
    }
    if(lt>=21 && lt<43){
      var p2=clamp((lt-22)/20,0,1); var env2=envelope(p2,0.08,0.08);
      var xin=clamp((lt-21)/2,0,1); var xout=clamp((43-lt)/2,0,1); env2*=Math.min(xin,xout);
      ctx.save(); ctx.globalAlpha=env2;
      var mergeP2=0.70; var prog=clamp(p2/mergeP2,0,1); var sep=lerp(S*0.30, S*0.0, smooth(prog));
      var ang=p2*TAU*(2.0+prog*5.0); var m1=4, m2=1, mt=m1+m2; var r1=sep*(m2/mt), r2=sep*(m1/mt);
      var x1=cx+Math.cos(ang)*r1, y1=cy+Math.sin(ang)*r1; var x2=cx-Math.cos(ang)*r2, y2=cy-Math.sin(ang)*r2;
      var merged2 = p2>mergeP2;
      ctx.save(); ctx.globalAlpha=env2*0.25; ctx.strokeStyle=COL.muted; ctx.lineWidth=1; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(cx-S*0.34,cy); ctx.lineTo(cx+S*0.34,cy); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
      function smbh(x,y,R,glowA){ var g=ctx.createRadialGradient(x,y,R*0.6,x,y,R*2.4); g.addColorStop(0,'rgba(240,165,0,'+(0.5*glowA)+')'); g.addColorStop(0.5,'rgba(240,165,0,'+(0.15*glowA)+')'); g.addColorStop(1,'rgba(240,165,0,0)'); ctx.save(); ctx.globalAlpha=env2; ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,R*2.4,0,TAU); ctx.fill(); ctx.restore(); dot(x,y,R,'#05070b',0); ctx.save(); ctx.globalAlpha=env2*0.8; ctx.strokeStyle=COL.gold; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(x,y,R,0,TAU); ctx.stroke(); ctx.restore(); }
      if(!merged2){
        smbh(x1,y1,S*0.05,0.9); smbh(x2,y2,S*0.028,0.7);
        function spinAxis(x,y,len,axang,col,a){ ctx.save(); ctx.globalAlpha=env2*a; ctx.strokeStyle=col; ctx.lineWidth=1.6; ctx.shadowColor=col; ctx.shadowBlur=6; ctx.beginPath(); ctx.moveTo(x-Math.cos(axang)*len,y-Math.sin(axang)*len); ctx.lineTo(x+Math.cos(axang)*len,y+Math.sin(axang)*len); ctx.stroke(); ctx.shadowBlur=0; ctx.restore(); }
        spinAxis(x1,y1,S*0.06,-Math.PI/2+0.15,COL.green,0.8); spinAxis(x2,y2,S*0.04,-Math.PI/2-0.2,COL.green,0.8);
      } else {
        var mp2=(p2-mergeP2)/(1-mergeP2); var flash2=Math.exp(-mp2*5);
        ctx.save(); ctx.globalAlpha=env2*flash2; dot(cx,cy,S*0.12*flash2,COL.white,40); dot(cx,cy,S*0.18*flash2,COL.gold,50); ctx.restore();
        for(var rj=0;rj<3;rj++){ var rr2=S*0.06+mp2*S*0.25+rj*S*0.04; ctx.save(); ctx.globalAlpha=env2*flash2*0.5/(rj+1); ctx.strokeStyle=COL.gold; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(cx,cy,rr2,0,TAU); ctx.stroke(); ctx.restore(); }
        smbh(cx,cy,S*0.06,0.9);
        var fromAng=-Math.PI/2; var toAng=-Math.PI/2 + lerp(0,2.2,smooth(mp2)); var curAng=lerp(fromAng,toAng,smooth(mp2)); var len=S*0.13;
        ctx.save(); ctx.globalAlpha=env2; ctx.strokeStyle=COL.white; ctx.lineWidth=2.2; ctx.shadowColor=COL.green; ctx.shadowBlur=12; ctx.beginPath(); ctx.moveTo(cx-Math.cos(curAng)*len,cy-Math.sin(curAng)*len); ctx.lineTo(cx+Math.cos(curAng)*len,cy+Math.sin(curAng)*len); ctx.stroke(); ctx.shadowBlur=0;
        dot(cx+Math.cos(curAng)*len,cy+Math.sin(curAng)*len,S*0.012,COL.green,10); dot(cx-Math.cos(curAng)*len,cy-Math.sin(curAng)*len,S*0.012,COL.green,10); ctx.restore();
        ctx.save(); ctx.globalAlpha=env2*0.3*(1-mp2*0.5); ctx.strokeStyle=COL.muted; ctx.setLineDash([3,3]); ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(cx-Math.cos(fromAng)*len,cy-Math.sin(fromAng)*len); ctx.lineTo(cx+Math.cos(fromAng)*len,cy+Math.sin(fromAng)*len); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
        ctx.save(); ctx.globalAlpha=env2*0.6; ctx.fillStyle=COL.muted; ctx.font='9px ui-monospace,monospace'; ctx.textAlign='right'; ctx.textBaseline='bottom'; ctx.fillText('spin flip',w-10,h-10); ctx.restore();
      }
      ctx.restore();
      label('Sgr A* PAST MAJOR MERGER',env2);
    }
    if(lt>=41){
      var p3=clamp((lt-42)/18,0,1); var env3=envelope(p3,0.10,0.10); var x3in=clamp((lt-41)/2,0,1); env3*=x3in;
      ctx.save(); ctx.globalAlpha=env3;
      var cbAng=p3*TAU*1.5; var cbSep=S*0.07;
      var cbx1=cx+Math.cos(cbAng)*cbSep*0.5, cby1=cy+Math.sin(cbAng)*cbSep*0.5; var cbx2=cx-Math.cos(cbAng)*cbSep*0.5, cby2=cy-Math.sin(cbAng)*cbSep*0.5;
      var cg=ctx.createRadialGradient(cx,cy,S*0.02,cx,cy,S*0.16); cg.addColorStop(0,'rgba(240,165,0,0.35)'); cg.addColorStop(1,'rgba(240,165,0,0)'); ctx.save(); ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(cx,cy,S*0.16,0,TAU); ctx.fill(); ctx.restore();
      dot(cbx1,cby1,S*0.03,'#05070b',0); dot(cbx2,cby2,S*0.022,'#05070b',0);
      ctx.save(); ctx.strokeStyle=COL.gold; ctx.lineWidth=1; ctx.globalAlpha=env3*0.8; ctx.beginPath(); ctx.arc(cbx1,cby1,S*0.03,0,TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(cbx2,cby2,S*0.022,0,TAU); ctx.stroke(); ctx.restore();
      var ap=p3; var bx,by; var enterX=-0.55, enterY=0.18;
      if(ap<0.5){ var u=ap/0.5; bx=cx + S*lerp(enterX, -0.04, smooth(u)); by=cy + S*lerp(enterY, 0.0, smooth(u)); }
      else { var v=(ap-0.5)/0.5; var ej=v*v; bx=cx + S*lerp(-0.04, 0.95, ej); by=cy + S*lerp(0.0, -0.62, ej); }
      var ejecting = ap>0.5; var bSep=S*0.022; var bAng=p3*TAU*9.0;
      var d1x=bx+Math.cos(bAng)*bSep, d1y=by+Math.sin(bAng)*bSep; var d2x=bx-Math.cos(bAng)*bSep, d2y=by-Math.sin(bAng)*bSep;
      if(ejecting){ var v2=(ap-0.5)/0.5; ctx.save(); ctx.globalAlpha=env3*0.5; ctx.strokeStyle=COL.green; ctx.lineWidth=1.4; ctx.shadowColor=COL.green; ctx.shadowBlur=8; var steps=8; ctx.beginPath(); for(var k=0;k<=steps;k++){ var vv=Math.max(0,v2-(k/steps)*0.35); var ejk=vv*vv; var tx2=cx + S*lerp(-0.04,0.95,ejk); var ty2=cy + S*lerp(0.0,-0.62,ejk); if(k===0) ctx.moveTo(tx2,ty2); else ctx.lineTo(tx2,ty2); } ctx.stroke(); ctx.shadowBlur=0; ctx.restore(); }
      dot(d1x,d1y,S*0.013,COL.white,8); dot(d2x,d2y,S*0.013,COL.green,8);
      ctx.save(); ctx.globalAlpha=env3*0.5; ctx.strokeStyle=COL.muted; ctx.lineWidth=0.8; ctx.beginPath(); ctx.moveTo(d1x,d1y); ctx.lineTo(d2x,d2y); ctx.stroke(); ctx.restore();
      if(ejecting){ ctx.save(); ctx.globalAlpha=env3*0.6; ctx.fillStyle=COL.muted; ctx.font='9px ui-monospace,monospace'; ctx.textAlign='right'; ctx.textBaseline='bottom'; ctx.fillText('v ≫ v_esc (bound pair)',w-10,h-10); ctx.restore(); }
      ctx.restore();
      label('HYPERVELOCITY BINARY EJECTION',env3);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};
  INIT[3] = function(canvas){
  var requestAnimationFrame = __gatedRAF(canvas);
  var ctx=canvas.getContext('2d'), w=1,h=1,dpr=1;
  function resize(){ dpr=Math.min(window.devicePixelRatio||1,2); var r=canvas.getBoundingClientRect(); w=Math.max(1,r.width); h=Math.max(1,r.height); canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); }
  resize(); window.addEventListener('resize', resize);

  var seed=20260626>>>0;
  function rnd(){ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; }
  var bg=[];
  for(var i=0;i<64;i++){ bg.push({x:rnd(),y:rnd(),r:0.3+rnd()*1.1,p:rnd()*6.283,tw:0.4+rnd()*0.9}); }

  var T=60, PI2=6.283185307;
  var C={green:'#39d353',gold:'#f0a500',white:'#e6edf3',muted:'#9aa4b2',bg:'#0d1117'};

  function ss(a,b,x){ if(b===a)return x<a?0:1; var t=(x-a)/(b-a); if(t<0)t=0; if(t>1)t=1; return t*t*(3-2*t); }
  function lerp(a,b,t){ return a+(b-a)*t; }
  function dot(x,y,r,col,blur,alpha){
    ctx.save(); ctx.globalAlpha=alpha==null?1:alpha;
    if(blur){ ctx.shadowBlur=blur; ctx.shadowColor=col; }
    ctx.fillStyle=col; ctx.beginPath(); ctx.arc(x,y,r,0,PI2); ctx.fill(); ctx.restore();
  }
  function orbit(cx,cy,a,e,arg,alpha,col){
    if(a<=0||e>=1||e<0||alpha<=0) return;
    var b=a*Math.sqrt(1-e*e), c=a*e;
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(arg); ctx.translate(-c,0);
    ctx.globalAlpha=alpha; ctx.strokeStyle=col; ctx.lineWidth=0.7;
    ctx.beginPath(); ctx.ellipse(0,0,a,b,0,0,PI2); ctx.stroke(); ctx.restore();
  }
  function epos(cx,cy,a,e,arg,E){
    var b=a*Math.sqrt(1-e*e), c=a*e;
    var px=a*Math.cos(E)-c, py=b*Math.sin(E);
    var ca=Math.cos(arg), sa=Math.sin(arg);
    return {x:cx+px*ca-py*sa, y:cy+px*sa+py*ca};
  }
  function flyby(cx,cy,u,len,imp,dir,bend){
    var x=u*len, y=imp - (imp>=0?bend:-bend)*Math.exp(-(u*u)*6);
    var c=Math.cos(dir), s=Math.sin(dir);
    return {x:cx+x*c-y*s, y:cy+x*s+y*c};
  }
  function label(txt,alpha){
    ctx.save(); ctx.globalAlpha=alpha; ctx.fillStyle=C.muted;
    ctx.font='10px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif';
    ctx.textBaseline='top'; ctx.fillText(txt,10,9); ctx.restore();
  }

  var start=null;
  function frame(ts){ if(start==null)start=ts; var t=(ts-start)/1000;
    if(w<2||h<2){ requestAnimationFrame(frame); return; }
    var lt=t%T;

    ctx.fillStyle=C.bg; ctx.fillRect(0,0,w,h);
    for(i=0;i<bg.length;i++){ var sbg=bg[i];
      ctx.globalAlpha=0.22+0.4*(0.5+0.5*Math.sin(t*sbg.tw+sbg.p));
      ctx.fillStyle=C.muted; ctx.beginPath(); ctx.arc(sbg.x*w,sbg.y*h,sbg.r,0,PI2); ctx.fill();
    }
    ctx.globalAlpha=1;

    var cx=w/2, cy=h/2, S=Math.min(w,h);
    var ph=Math.floor(lt/15), lp=lt-ph*15, prog=lp/15;
    var fade=ss(0,1.3,lp)*ss(15,13.7,lp);
    var lbA=ss(0.5,1.7,lp)*ss(15,13.2,lp);
    function host(){ dot(cx,cy,3.4,C.white, fade>0.25?10:0, fade); }

    if(ph===0){
      var t0=0.16,t1=0.42,t2=0.80;
      var aIn0=0.20*S, aHot=0.072*S, aIn, eIn;
      if(prog<t0){ eIn=0.05; aIn=aIn0; }
      else if(prog<t1){ var k=ss(t0,t1,prog); eIn=lerp(0.05,0.9,k); aIn=lerp(aIn0,aIn0*0.95,k); }
      else if(prog<t2){ var k2=ss(t1,t2,prog); eIn=lerp(0.9,0.02,k2); aIn=lerp(aIn0*0.95,aHot,k2); }
      else { eIn=0.02; aIn=aHot; }
      var argIn=0.6;
      var aOut=lerp(0.34*S,0.46*S,ss(t0,t2,prog));
      var eOut=lerp(0.04,0.16,ss(t0,t2,prog));
      var argOut=2.4;
      orbit(cx,cy,aIn,eIn,argIn,fade*0.85,C.gold);
      orbit(cx,cy,aOut,eOut,argOut,fade*0.7,C.green);
      host();
      var pin=epos(cx,cy,aIn,eIn,argIn,(t*2.2)%PI2);
      var pout=epos(cx,cy,aOut,eOut,argOut,(t*0.85)%PI2);
      dot(pin.x,pin.y,2.6,C.gold,8,fade);
      dot(pout.x,pout.y,2.2,C.green,0,fade);
      var u=lerp(-1.0,1.0,ss(0.02,0.62,prog));
      var f=flyby(cx,cy,u,0.85*S,-0.30*S,-0.5,0.10*S);
      var fbA=fade*ss(0.03,0.12,prog)*ss(0.7,0.55,prog);
      if(fbA>0.01) dot(f.x,f.y,2.4,C.white,8,fbA);
      label('HOT JUPITER MIGRATION',lbA);
    }
    else if(ph===1){
      var argA=0.3,argB=2.0, aA=0.16*S,aB=0.30*S, eA=0.04,eB=0.07;
      var tE=0.45;
      orbit(cx,cy,aA,eA,argA,fade*0.85,C.gold);
      if(prog<tE) orbit(cx,cy,aB,eB,argB,fade*0.7*ss(tE+0.04,tE-0.12,prog),C.green);
      host();
      var pA=epos(cx,cy,aA,eA,argA,(t*1.6)%PI2);
      dot(pA.x,pA.y,2.4,C.gold,8,fade);
      var wB=0.95, pB;
      if(prog<tE){ pB=epos(cx,cy,aB,eB,argB,(lt*wB)%PI2); }
      else {
        var p0=epos(cx,cy,aB,eB,argB,((tE*15)*wB)%PI2);
        var dx=p0.x-cx, dy=p0.y-cy, dl=Math.hypot(dx,dy)||1; dx/=dl; dy/=dl;
        var tx=-dy, ty=dx;
        var ex=dx*0.85+tx*0.55, ey=dy*0.85+ty*0.55, el=Math.hypot(ex,ey); ex/=el; ey/=el;
        var d=ss(tE,1.0,prog)*0.95*S;
        pB={x:p0.x+ex*d, y:p0.y+ey*d};
      }
      dot(pB.x,pB.y,2.2,C.green, prog>tE?9:0, fade);
      var u1=lerp(-1.0,1.1,ss(0.05,0.7,prog));
      var f1=flyby(cx,cy,u1,0.9*S,0.22*S,2.6,0.09*S);
      var fbA1=fade*ss(0.05,0.15,prog)*ss(0.65,0.5,prog);
      if(fbA1>0.01) dot(f1.x,f1.y,2.4,C.white,8,fbA1);
      label('FREE-FLOATING PLANET',lbA);
    }
    else if(ph===2){
      var argA2=0.9,argB2=2.6, aA2=0.20*S,aB2=0.31*S, eA2=0.05,eB2=0.06;
      var tE2=0.42, wA2=1.3, wB2=0.95;
      if(prog<tE2){
        orbit(cx,cy,aA2,eA2,argA2,fade*0.75*ss(tE2+0.04,tE2-0.12,prog),C.gold);
        orbit(cx,cy,aB2,eB2,argB2,fade*0.7*ss(tE2+0.04,tE2-0.12,prog),C.green);
      }
      host();
      var g1,g2;
      if(prog<tE2){
        g1=epos(cx,cy,aA2,eA2,argA2,(lt*wA2)%PI2);
        g2=epos(cx,cy,aB2,eB2,argB2,(lt*wB2)%PI2);
      } else {
        var p1=epos(cx,cy,aA2,eA2,argA2,((tE2*15)*wA2)%PI2);
        var p2=epos(cx,cy,aB2,eB2,argB2,((tE2*15)*wB2)%PI2);
        var comx=(p1.x+p2.x)/2, comy=(p1.y+p2.y)/2;
        var k=ss(tE2,1.0,prog);
        var dx2=comx-cx, dy2=comy-cy, dl2=Math.hypot(dx2,dy2)||1; dx2/=dl2; dy2/=dl2;
        var d2=k*0.82*S, ccx=comx+dx2*d2, ccy=comy+dy2*d2;
        var sep=lerp(0.034*S,0.046*S,k), pa=lt*2.4;
        g1={x:ccx+Math.cos(pa)*sep, y:ccy+Math.sin(pa)*sep};
        g2={x:ccx-Math.cos(pa)*sep, y:ccy-Math.sin(pa)*sep};
        ctx.save(); ctx.globalAlpha=fade*0.55; ctx.strokeStyle=C.muted; ctx.lineWidth=0.6;
        ctx.beginPath(); ctx.arc(ccx,ccy,sep,0,PI2); ctx.stroke();
        ctx.globalAlpha=fade*0.35; ctx.beginPath(); ctx.moveTo(g1.x,g1.y); ctx.lineTo(g2.x,g2.y); ctx.stroke();
        ctx.restore();
      }
      dot(g1.x,g1.y,2.6,C.gold,8,fade);
      dot(g2.x,g2.y,2.4,C.green,6,fade);
      var u2=lerp(-1.0,1.1,ss(0.05,0.7,prog));
      var f2=flyby(cx,cy,u2,0.9*S,-0.20*S,0.4,0.09*S);
      var fbA2=fade*ss(0.05,0.15,prog)*ss(0.6,0.45,prog);
      if(fbA2>0.01) dot(f2.x,f2.y,2.4,C.white,8,fbA2);
      label('JuMBO',lbA);
    }
    else {
      var argA3=1.2,argB3=2.8, aA3=0.15*S,aB3=0.28*S, eA3=0.04,eB3=0.06;
      var tC=0.5, wB3=1.0;
      var u3=lerp(-1.0,1.1,ss(0.05,0.85,prog));
      var f3=flyby(cx,cy,u3,0.95*S,0.14*S,-2.3,0.06*S);
      orbit(cx,cy,aA3,eA3,argA3,fade*0.85,C.gold);
      if(prog<tC) orbit(cx,cy,aB3,eB3,argB3,fade*0.7*ss(tC+0.04,tC-0.14,prog),C.green);
      host();
      var pA3=epos(cx,cy,aA3,eA3,argA3,(t*1.7)%PI2);
      dot(pA3.x,pA3.y,2.4,C.gold,8,fade);
      var pB3;
      if(prog<tC){ pB3=epos(cx,cy,aB3,eB3,argB3,(lt*wB3)%PI2); }
      else {
        var sep3=0.05*S, pa3=lt*2.6;
        pB3={x:f3.x+Math.cos(pa3)*sep3, y:f3.y+Math.sin(pa3)*sep3};
        ctx.save(); ctx.globalAlpha=fade*0.5; ctx.strokeStyle=C.green; ctx.lineWidth=0.6;
        ctx.beginPath(); ctx.arc(f3.x,f3.y,sep3,0,PI2); ctx.stroke(); ctx.restore();
      }
      dot(pB3.x,pB3.y,2.3,C.green, prog>tC?7:0, fade);
      var fbA3=fade*ss(0.05,0.15,prog);
      dot(f3.x,f3.y,2.6,C.white,8,fbA3);
      label('GIANT-PLANET SWAP',lbA);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};
  INIT[4] = function(canvas){
  var requestAnimationFrame = __gatedRAF(canvas);
  var ctx=canvas.getContext('2d'), w=1,h=1,dpr=1;
  function resize(){ dpr=Math.min(window.devicePixelRatio||1,2); var r=canvas.getBoundingClientRect(); w=Math.max(1,r.width); h=Math.max(1,r.height); canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); }
  resize(); window.addEventListener('resize', resize);

  // ---- colours: energy -> colour ----
  var C_GAMMA='#cdd6ff';   // hardest: gamma / hard X-ray (white-blue)
  var C_VIOLET='#a78bfa';  // hard X-ray / violet
  var C_OPT='#f0a500';     // optical (amber)
  var C_RADIO='#39d353';   // radio (green, softest)
  var BG='#0d1117';
  var MUTE='#9aa4b2';

  // ---- deterministic background starfield (Math.random only at setup) ----
  var stars=[];
  (function(){ for(var i=0;i<70;i++){ stars.push({x:Math.random(),y:Math.random(),b:0.25+Math.random()*0.7,ph:Math.random()*6.28,sp:0.5+Math.random()*1.5}); } })();
  // deterministic ejecta clumps
  var clumps=[]; (function(){ for(var i=0;i<60;i++){ var a=Math.random()*6.2832; clumps.push({a:a, r:0.6+Math.random()*0.4, sz:0.4+Math.random()*0.9, ph:Math.random()*6.28}); } })();
  // deterministic ISM dots (afterglow medium)
  var ism=[]; (function(){ for(var i=0;i<48;i++){ ism.push({a:Math.random()*6.2832, r:0.2+Math.random()*0.9, b:0.2+Math.random()*0.6}); } })();
  // deterministic disk speckle (AGN)
  var disk=[]; (function(){ for(var i=0;i<90;i++){ disk.push({x:Math.random(),y:Math.random()*0.6-0.3,b:0.2+Math.random()*0.8,sp:0.4+Math.random()*1.6,ph:Math.random()*6.28}); } })();

  var T=60;

  function lerp(a,b,t){return a+(b-a)*t;}
  function clamp(x,a,b){return x<a?a:(x>b?b:x);}
  function ease(t){return t<0?0:(t>1?1:t*t*(3-2*t));}
  // cross-fade weight for a phase window [s,e] with fade f at edges
  function pw(lt,s,e,f){
    var up=ease((lt-s)/f);
    var dn=1-ease((lt-(e-f))/f);
    return clamp(Math.min(up,dn),0,1);
  }
  function withA(hex,a){
    var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
    return 'rgba('+r+','+g+','+b+','+a+')';
  }

  function background(t){
    ctx.fillStyle=BG; ctx.fillRect(0,0,w,h);
    var S=Math.min(w,h);
    for(var i=0;i<stars.length;i++){ var st=stars[i];
      var tw=0.5+0.5*Math.sin(t*st.sp+st.ph);
      ctx.fillStyle=withA('#c8d0e0', st.b*0.5*tw);
      ctx.fillRect(st.x*w, st.y*h, 1.2, 1.2);
    }
  }

  function label(txt){
    ctx.save();
    ctx.font='10px -apple-system,Segoe UI,Roboto,sans-serif';
    var tw=ctx.measureText(txt).width;
    ctx.fillStyle='rgba(5,8,14,0.62)';
    ctx.fillRect(8,8,tw+12,17);
    ctx.fillStyle=MUTE;
    ctx.textBaseline='middle';
    ctx.fillText(txt,14,17);
    ctx.restore();
  }

  // ============ PHASE 1: MAGNETAR ENGINE & JET BREAKOUT ============
  function phase1(t,lt,A){
    if(A<=0) return;
    var S=Math.min(w,h), cx=w/2, cy=h/2;
    var p=clamp((lt-0)/16,0,1); // local progress
    ctx.save(); ctx.globalAlpha=A;

    // expanding SN ejecta shell (spherical)
    var shellR=S*(0.10+0.30*ease(p));
    // ejecta body (clumpy, dim, reddish)
    ctx.save();
    for(var i=0;i<clumps.length;i++){ var c=clumps[i];
      var rr=shellR*c.r;
      var px=cx+Math.cos(c.a)*rr, py=cy+Math.sin(c.a)*rr*0.92;
      var fl=0.4+0.3*Math.sin(t*1.2+c.ph);
      ctx.fillStyle=withA('#7a4a3a',0.18*fl);
      ctx.beginPath(); ctx.arc(px,py,c.sz*S*0.018,0,6.2832); ctx.fill();
    }
    ctx.restore();
    // shell outline
    ctx.strokeStyle=withA('#9a5a44',0.30); ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.ellipse(cx,cy,shellR,shellR*0.92,0,0,6.2832); ctx.stroke();
    ctx.strokeStyle=withA('#c08060',0.12); ctx.lineWidth=4;
    ctx.beginPath(); ctx.ellipse(cx,cy,shellR,shellR*0.92,0,0,6.2832); ctx.stroke();

    // --- narrow ultra-relativistic bipolar jet along spin axis (vertical) ---
    // jet drills out: length grows, breaks out once it exceeds shell
    var jetLen=S*(0.06+0.50*ease(clamp((p-0.12)/0.88,0,1)));
    var broke=jetLen>shellR*0.96;
    var halfAng=0.05; // ~ a few degrees opening angle (very narrow)
    var dirs=[-1,1];
    for(var d=0;d<2;d++){
      var sgn=dirs[d];
      var tipY=cy+sgn*jetLen;
      var baseW=S*0.010;
      var tipW=baseW+jetLen*halfAng; // small opening angle
      // jet body gradient (white-violet, hardest)
      var g=ctx.createLinearGradient(cx,cy,cx,tipY);
      g.addColorStop(0,withA(C_GAMMA,0.95));
      g.addColorStop(0.5,withA(C_VIOLET,0.55));
      g.addColorStop(1,withA(C_VIOLET,0.0));
      ctx.fillStyle=g;
      ctx.beginPath();
      ctx.moveTo(cx-baseW,cy);
      ctx.lineTo(cx+baseW,cy);
      ctx.lineTo(cx+tipW,tipY);
      ctx.lineTo(cx-tipW,tipY);
      ctx.closePath(); ctx.fill();
      // bright thin spindle core moving fast
      ctx.strokeStyle=withA(C_GAMMA,0.9); ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx,tipY); ctx.stroke();
      // fast-moving knots along the jet
      for(var k=0;k<4;k++){
        var f=((t*0.9+k*0.27)%1);
        var ky=cy+sgn*f*jetLen;
        var kr=baseW*0.7*(1-f*0.4);
        ctx.fillStyle=withA(C_GAMMA,0.85*(1-f));
        ctx.beginPath(); ctx.arc(cx,ky,kr,0,6.2832); ctx.fill();
      }
      // breakout flash at shell surface
      if(broke){
        var bx=cx, by=cy+sgn*shellR*0.96;
        var bg=ctx.createRadialGradient(bx,by,0,bx,by,S*0.06);
        bg.addColorStop(0,withA(C_GAMMA,0.55));
        bg.addColorStop(1,withA(C_VIOLET,0));
        ctx.fillStyle=bg;
        ctx.beginPath(); ctx.arc(bx,by,S*0.06,0,6.2832); ctx.fill();
      }
    }

    // --- newborn magnetar: small bright rapidly spinning neutron star ---
    var spin=t*7.5; // rapid spin
    // glow
    var ng=ctx.createRadialGradient(cx,cy,0,cx,cy,S*0.05);
    ng.addColorStop(0,withA('#ffffff',0.95));
    ng.addColorStop(0.5,withA(C_VIOLET,0.5));
    ng.addColorStop(1,withA(C_VIOLET,0));
    ctx.fillStyle=ng;
    ctx.beginPath(); ctx.arc(cx,cy,S*0.05,0,6.2832); ctx.fill();
    // core
    ctx.fillStyle='#ffffff';
    ctx.beginPath(); ctx.arc(cx,cy,S*0.012,0,6.2832); ctx.fill();
    // magnetic field-line arcs (dipole), rotating with the star
    ctx.save();
    ctx.translate(cx,cy); ctx.rotate(spin*0.15);
    ctx.strokeStyle=withA(C_VIOLET,0.55); ctx.lineWidth=1.1;
    for(var m=0;m<2;m++){
      var side=(m===0)?1:-1;
      ctx.beginPath();
      ctx.moveTo(0,-S*0.012);
      ctx.bezierCurveTo(side*S*0.07,-S*0.02, side*S*0.07,S*0.02, 0,S*0.012);
      ctx.stroke();
    }
    // rotating polar beam hint (lighthouse), aligned to spin
    ctx.rotate(spin);
    ctx.strokeStyle=withA(C_GAMMA,0.25); ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,-S*0.02); ctx.lineTo(0,-S*0.045); ctx.stroke();
    ctx.restore();

    ctx.restore();
    if(A>0.5) label('MAGNETAR ENGINE & JET BREAKOUT');
  }

  // ============ PHASE 2: PROMPT GAMMA-RAY EMISSION ============
  function phase2(t,lt,A){
    if(A<=0) return;
    var S=Math.min(w,h), cx=w/2, cy=h/2;
    ctx.save(); ctx.globalAlpha=A;

    // faint residual ejecta shell (now far out)
    ctx.strokeStyle=withA('#9a5a44',0.10); ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.ellipse(cx,cy,S*0.42,S*0.40,0,0,6.2832); ctx.stroke();

    // narrow relativistic jet channel (vertical, both poles), faint
    var jetLen=S*0.46, halfAng=0.05;
    for(var d=0;d<2;d++){
      var sgn=(d===0)?-1:1;
      var tipY=cy+sgn*jetLen, baseW=S*0.010, tipW=baseW+jetLen*halfAng;
      var g=ctx.createLinearGradient(cx,cy,cx,tipY);
      g.addColorStop(0,withA(C_VIOLET,0.25));
      g.addColorStop(1,withA(C_VIOLET,0));
      ctx.fillStyle=g;
      ctx.beginPath();
      ctx.moveTo(cx-baseW,cy); ctx.lineTo(cx+baseW,cy);
      ctx.lineTo(cx+tipW,tipY); ctx.lineTo(cx-tipW,tipY);
      ctx.closePath(); ctx.fill();
    }

    // --- internal shocks: brief, highly variable HARD pulses beamed along axis ---
    // build a rapid variable light-curve value (sum of fast spikes), deterministic
    function lc(time){
      var v=0;
      v+=Math.max(0,Math.sin(time*9.0))*Math.max(0,Math.sin(time*23.0));
      v+=0.7*Math.max(0,Math.sin(time*15.0+1.3))*Math.max(0,Math.sin(time*31.0));
      v+=0.5*Math.pow(Math.max(0,Math.sin(time*5.0+0.6)),3);
      return clamp(v,0,1.4);
    }
    var amp=lc(t);

    // shooting hard flashes along the jet (both poles), collimated
    for(var d=0;d<2;d++){
      var sgn=(d===0)?-1:1;
      for(var k=0;k<5;k++){
        var seed=k*0.41+d*0.13;
        var f=((t*1.4+seed)%1);
        var pulse=lc(t*1.0+k*0.7+d*2.0);
        if(pulse<0.18) continue;
        var py=cy+sgn*f*jetLen;
        var px=cx+(((k%2)*2-1)*S*0.004*(1-f)); // tiny jitter, stays collimated
        var rad=S*(0.006+0.02*pulse)*(1-f*0.3);
        var col=(pulse>0.7)?C_GAMMA:C_VIOLET;
        var pg=ctx.createRadialGradient(px,py,0,px,py,rad*2.4);
        pg.addColorStop(0,withA(col,0.9*pulse));
        pg.addColorStop(0.4,withA(col,0.4*pulse));
        pg.addColorStop(1,withA(col,0));
        ctx.fillStyle=pg;
        ctx.beginPath(); ctx.arc(px,py,rad*2.4,0,6.2832); ctx.fill();
        ctx.fillStyle=withA(C_GAMMA,0.95*pulse);
        ctx.beginPath(); ctx.arc(px,py,rad*0.5,0,6.2832); ctx.fill();
      }
    }

    // central engine still bright & spiking
    var cg=ctx.createRadialGradient(cx,cy,0,cx,cy,S*(0.03+0.04*amp));
    cg.addColorStop(0,withA('#ffffff',0.9));
    cg.addColorStop(0.5,withA(C_VIOLET,0.4*clamp(amp,0,1)));
    cg.addColorStop(1,withA(C_VIOLET,0));
    ctx.fillStyle=cg;
    ctx.beginPath(); ctx.arc(cx,cy,S*(0.03+0.04*amp),0,6.2832); ctx.fill();

    // --- prompt light curve inset (rapid flicker), bottom-right ---
    var iw=S*0.30, ih=S*0.11, ix=w-iw-10, iy=h-ih-10;
    ctx.fillStyle='rgba(5,8,14,0.5)'; ctx.fillRect(ix,iy,iw,ih);
    ctx.strokeStyle=withA(MUTE,0.35); ctx.lineWidth=1;
    ctx.strokeRect(ix,iy,iw,ih);
    ctx.beginPath();
    for(var xi=0;xi<=Math.round(iw);xi+=2){
      var tt=t-(iw-xi)/iw*4.0; // last 4s scroll
      var vv=lc(tt)/1.4;
      var yy=iy+ih-2-vv*(ih-4);
      if(xi===0) ctx.moveTo(ix+xi,yy); else ctx.lineTo(ix+xi,yy);
    }
    ctx.strokeStyle=withA(C_GAMMA,0.9); ctx.lineWidth=1.2; ctx.stroke();
    ctx.fillStyle=withA(MUTE,0.7);
    ctx.font='8px -apple-system,sans-serif'; ctx.textBaseline='alphabetic';
    ctx.fillText('count rate',ix+3,iy+10);

    ctx.restore();
    if(A>0.5) label('PROMPT GAMMA-RAY EMISSION');
  }

  // ============ PHASE 3: AFTERGLOW — FORWARD SHOCK ============
  function phase3(t,lt,A){
    if(A<=0) return;
    var S=Math.min(w,h), cx=w/2, cy=h/2;
    var p=clamp((lt-30)/16,0,1);
    ctx.save(); ctx.globalAlpha=A;

    // external medium (ISM dots) being swept up
    for(var i=0;i<ism.length;i++){ var m=ism[i];
      var rr=S*0.45*m.r;
      ctx.fillStyle=withA('#5a6b7a',0.18*m.b);
      ctx.fillRect(cx+Math.cos(m.a)*rr, cy+Math.sin(m.a)*rr, 1.4,1.4);
    }

    // decelerating jet (short, fading) along axis
    var jetLen=S*0.30*(1-0.4*ease(p));
    for(var d=0;d<2;d++){
      var sgn=(d===0)?-1:1, tipY=cy+sgn*jetLen;
      var g=ctx.createLinearGradient(cx,cy,cx,tipY);
      g.addColorStop(0,withA(C_VIOLET,0.35*(1-p)));
      g.addColorStop(1,withA(C_VIOLET,0));
      ctx.strokeStyle=g; ctx.lineWidth=2.2;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx,tipY); ctx.stroke();
    }

    // --- COLLIMATED forward (external) shock: a narrow CAP/CONE at the head of
    // each bipolar jet, expanding ALONG the spin axis (not a sphere). It plows
    // into the swept-up medium with the jet's small opening angle.
    // LATE-TIME JET BREAK: once the jet decelerates (Gamma ~ 1/theta_jet) it
    // spreads laterally -> the cap widens toward quasi-spherical only at the end.
    var jb=ease(clamp((p-0.62)/0.38,0,1)); // jet-break / lateral-spreading factor
    var headDist=S*(0.16+0.30*ease(p));     // distance of shock head along axis
    var halfAng=0.09+(0.75)*jb;             // small opening angle early, widens after break
    var bands=[C_GAMMA,C_OPT,C_RADIO];
    for(var d2=0;d2<2;d2++){
      var sgn2=(d2===0)?-1:1;
      var hx=cx, hy=cy+sgn2*headDist;       // head position along axis
      var halfW=headDist*Math.sin(halfAng); // lateral half-width of the cap
      // multi-band synchrotron shock cap (curved arc), drawn as an arc segment
      for(var b=0;b<3;b++){
        var col=bands[b];
        var off=b*S*0.012;
        var capR=headDist+off;
        // angular half-extent of the cap as seen from the source
        var ang=halfAng+0.03*b;
        var a0=(sgn2<0)?(-Math.PI/2-ang):(Math.PI/2-ang);
        var a1=(sgn2<0)?(-Math.PI/2+ang):(Math.PI/2+ang);
        ctx.strokeStyle=withA(col,0.30*(1-0.18*b)*(0.6+0.4*(1-p)));
        ctx.lineWidth=2.2-b*0.4;
        ctx.beginPath(); ctx.arc(cx,cy,capR,a0,a1); ctx.stroke();
      }
      // bright leading rim of the cap (synchrotron glow concentrated at the head)
      var rg=ctx.createRadialGradient(hx,hy,0,hx,hy,S*0.10*(1+0.6*jb));
      rg.addColorStop(0,withA(C_GAMMA,0.30*(0.7+0.3*(1-p))));
      rg.addColorStop(0.5,withA(C_OPT,0.14));
      rg.addColorStop(1,withA(C_OPT,0));
      ctx.fillStyle=rg;
      ctx.beginPath();
      ctx.ellipse(hx,hy,Math.max(halfW,S*0.03),S*0.06*(1+0.5*jb),0,0,6.2832);
      ctx.fill();
      // thin cone walls from source to cap edges (the collimated channel head)
      ctx.strokeStyle=withA(C_VIOLET,0.18*(1-jb)*(1-0.4*p)); ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.lineTo(hx-halfW,hy);
      ctx.moveTo(cx,cy);
      ctx.lineTo(hx+halfW,hy);
      ctx.stroke();
    }

    // central engine fading
    ctx.fillStyle=withA(C_VIOLET,0.5*(1-p));
    ctx.beginPath(); ctx.arc(cx,cy,S*0.012,0,6.2832); ctx.fill();

    // --- multi-band light-curve inset (log-log): X-ray & optical peak early, radio late ---
    var iw=S*0.36, ih=S*0.26, ix=w-iw-10, iy=h-ih-10;
    ctx.fillStyle='rgba(5,8,14,0.55)'; ctx.fillRect(ix,iy,iw,ih);
    ctx.strokeStyle=withA(MUTE,0.45); ctx.lineWidth=1;
    // axes (log-log)
    ctx.beginPath(); ctx.moveTo(ix+18,iy+4); ctx.lineTo(ix+18,iy+ih-12); ctx.lineTo(ix+iw-4,iy+ih-12); ctx.stroke();
    // faint log gridlines
    ctx.strokeStyle=withA(MUTE,0.16); ctx.lineWidth=0.6;
    for(var gx=1;gx<4;gx++){ var X=ix+18+(iw-22)*gx/4; ctx.beginPath(); ctx.moveTo(X,iy+4); ctx.lineTo(X,iy+ih-12); ctx.stroke(); }
    for(var gy=1;gy<3;gy++){ var Y=iy+4+(ih-16)*gy/3; ctx.beginPath(); ctx.moveTo(ix+18,Y); ctx.lineTo(ix+iw-4,Y); ctx.stroke(); }
    ctx.fillStyle=withA(MUTE,0.7); ctx.font='8px -apple-system,sans-serif'; ctx.textBaseline='alphabetic';
    ctx.fillText('log F',ix+1,iy+12);
    ctx.fillText('log t',ix+iw-22,iy+ih-2);

    // log-log light curve: F = (t/tp)^a rise then ^-b decay; radio tp larger
    function band(tp,rise,decay,col,reveal){
      ctx.beginPath();
      var n=60;
      for(var s=0;s<=n;s++){
        var lx=s/n; // log time 0..1
        // map to a relative time
        var ratio=Math.pow(10,(lx*2.2-0.4)); // ~10^-0.4 .. 10^1.8
        var rel=ratio/tp;
        var F;
        if(rel<1) F=Math.pow(rel,rise); else F=Math.pow(rel,-decay);
        var ly=clamp(0.18+0.7*(1+Math.log(F+1e-3)/Math.LN10/2.2),0,1);
        var PX=ix+18+(iw-22)*lx;
        var PY=iy+ih-12-(ih-16)*ly;
        if(s===0) ctx.moveTo(PX,PY); else ctx.lineTo(PX,PY);
      }
      ctx.strokeStyle=withA(col,0.85*reveal); ctx.lineWidth=1.3; ctx.stroke();
    }
    // reveal bands progressively as afterglow ages
    band(0.4,1.6,1.2,C_GAMMA, clamp(p*2,0,1));         // X-ray: peaks earliest
    band(0.9,1.4,1.0,C_OPT,   clamp((p-0.1)*2,0,1));    // optical: peaks early
    band(3.5,1.0,0.7,C_RADIO, clamp((p-0.25)*1.8,0,1)); // radio: peaks much later
    // legend
    ctx.font='7px -apple-system,sans-serif';
    ctx.fillStyle=withA(C_GAMMA,0.9); ctx.fillText('X-ray',ix+22,iy+12);
    ctx.fillStyle=withA(C_OPT,0.9); ctx.fillText('opt',ix+22+30,iy+12);
    ctx.fillStyle=withA(C_RADIO,0.9); ctx.fillText('radio',ix+22+54,iy+12);

    ctx.restore();
    if(A>0.5) label('AFTERGLOW: FORWARD SHOCK');
  }

  // ============ PHASE 4: AFTERGLOW IN AN AGN DISK ============
  function phase4(t,lt,A){
    if(A<=0) return;
    var S=Math.min(w,h), cx=w/2, cy=h/2;
    var p=clamp((lt-46)/14,0,1);
    ctx.save(); ctx.globalAlpha=A;

    // --- thick optically-thick AGN accretion-disk slab (horizontal) ---
    var slabH=S*0.42;
    var dg=ctx.createLinearGradient(0,cy-slabH/2,0,cy+slabH/2);
    dg.addColorStop(0,withA('#1a1410',0));
    dg.addColorStop(0.5,withA('#3a2418',0.9));
    dg.addColorStop(1,withA('#1a1410',0));
    ctx.fillStyle=dg; ctx.fillRect(0,cy-slabH/2,w,slabH);
    // hot mid-plane glow (reddened)
    var mg=ctx.createLinearGradient(0,cy-slabH*0.12,0,cy+slabH*0.12);
    mg.addColorStop(0,withA('#5a3018',0));
    mg.addColorStop(0.5,withA('#8a4422',0.55));
    mg.addColorStop(1,withA('#5a3018',0));
    ctx.fillStyle=mg; ctx.fillRect(0,cy-slabH*0.12,w,slabH*0.24);
    // disk speckle / turbulence (shearing)
    for(var i=0;i<disk.length;i++){ var s=disk[i];
      var sx=((s.x+ t*0.02*s.sp)%1)*w;
      var sy=cy+s.y*slabH;
      var fl=0.4+0.4*Math.sin(t*s.sp+s.ph);
      ctx.fillStyle=withA('#a85a30',0.18*s.b*fl);
      ctx.fillRect(sx,sy,1.6,1.6);
    }

    // burst location embedded in disk
    var bx=cx, by=cy;

    // --- GHOST: would-be sharp beamed afterglow (clean case), shown faint for contrast ---
    var ghostA=0.30*(1-0.4*p);
    var gShock=S*(0.12+0.30*ease(p));
    ctx.setLineDash([3,4]);
    for(var b2=0;b2<2;b2++){
      var gc=[C_GAMMA,C_OPT][b2];
      ctx.strokeStyle=withA(gc,ghostA*(1-0.3*b2));
      ctx.lineWidth=1;
      ctx.beginPath(); ctx.ellipse(bx,by,gShock+b2*S*0.012,(gShock+b2*S*0.012)*0.96,0,0,6.2832); ctx.stroke();
    }
    // ghost beamed jet (sharp, vertical) — but it's buried in the disk
    var gj=ctx.createLinearGradient(bx,by,bx,by-S*0.22);
    gj.addColorStop(0,withA(C_VIOLET,ghostA));
    gj.addColorStop(1,withA(C_VIOLET,0));
    ctx.strokeStyle=gj; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx,by-S*0.22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx,by+S*0.22); ctx.stroke();
    ctx.setLineDash([]);

    // --- REAL signal: diffused, reddened, delayed, isotropic glow seeping out ---
    // diffusion delay: emergence lags; low freq (radio/optical) suppressed first
    var emerge=ease(clamp((p-0.25)/0.75,0,1)); // delayed & smeared emergence
    var rOut=S*(0.05+0.22*emerge);
    // self-absorption: radio & optical dim out; survives mostly as reddened mid-band
    var glow=ctx.createRadialGradient(bx,by,0,bx,by,rOut*1.6);
    // reddened core (hard photons survive somewhat but reddened toward optical/red)
    glow.addColorStop(0,withA('#ffd9a0',0.55*emerge));
    glow.addColorStop(0.35,withA(C_OPT,0.32*emerge));
    glow.addColorStop(0.7,withA('#b04a22',0.22*emerge)); // reddened
    glow.addColorStop(1,withA('#b04a22',0));
    ctx.fillStyle=glow;
    ctx.beginPath(); ctx.arc(bx,by,rOut*1.6,0,6.2832); ctx.fill();

    // smeared isotropic seepage above/below disk surface (photon diffusion, blurred)
    for(var pdir=0;pdir<2;pdir++){
      var sgn=(pdir===0)?-1:1;
      var puffY=by+sgn*slabH*0.5;
      var puff=ctx.createRadialGradient(bx,puffY,0,bx,puffY,S*0.16*emerge);
      puff.addColorStop(0,withA('#c0683a',0.30*emerge));
      puff.addColorStop(1,withA('#c0683a',0));
      ctx.fillStyle=puff;
      ctx.beginPath(); ctx.ellipse(bx,puffY,S*0.20*emerge,S*0.10*emerge,0,0,6.2832); ctx.fill();
    }

    // small annotation contrasting clean vs disk afterglow
    var iw=S*0.40, ih=S*0.085, ix=w-iw-10, iy=h-ih-10;
    ctx.fillStyle='rgba(5,8,14,0.5)'; ctx.fillRect(ix,iy,iw,ih);
    ctx.font='8px -apple-system,sans-serif'; ctx.textBaseline='middle';
    ctx.setLineDash([3,3]);
    ctx.strokeStyle=withA(C_GAMMA,0.7); ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(ix+6,iy+ih*0.32); ctx.lineTo(ix+24,iy+ih*0.32); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle=withA(MUTE,0.85); ctx.fillText('clean beamed afterglow',ix+28,iy+ih*0.32);
    ctx.strokeStyle=withA('#c0683a',0.9); ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.moveTo(ix+6,iy+ih*0.72); ctx.lineTo(ix+24,iy+ih*0.72); ctx.stroke();
    ctx.fillStyle=withA('#d08a55',0.95); ctx.fillText('reddened, diffused, delayed',ix+28,iy+ih*0.72);

    ctx.restore();
    if(A>0.5) label('AFTERGLOW IN AN AGN DISK');
  }

  var start=null;
  function frame(ts){
    if(start==null)start=ts;
    var t=(ts-start)/1000;
    if(w<2||h<2){requestAnimationFrame(frame);return;}
    var lt=t%T;
    var F=1.5; // cross-fade duration

    background(t);

    // phase windows: 0-16, 16-30, 30-46, 46-60 with cross-fade
    var a1=pw(lt,0,16,F);
    var a2=pw(lt,16,30,F);
    var a3=pw(lt,30,46,F);
    var a4=pw(lt,46,60,F);
    // handle wrap fade at the very end -> start of phase1
    if(lt>60-F){ a1=Math.max(a1, ease((lt-(60-F))/F)); }

    phase1(t,lt,a1);
    phase2(t,lt,a2);
    phase3(t,lt,a3);
    phase4(t,lt,a4);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};
  INIT[5] = function(canvas){
  var requestAnimationFrame = __gatedRAF(canvas);
  var ctx=canvas.getContext('2d'), w=1,h=1,dpr=1;
  function resize(){ dpr=Math.min(window.devicePixelRatio||1,2); var r=canvas.getBoundingClientRect(); w=Math.max(1,r.width); h=Math.max(1,r.height); canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); }
  resize(); window.addEventListener('resize', resize);

  var GREEN='#39d353', AMBER='#f0a500', WHITE='#e6edf3', MUTED='#9aa4b2', BG='#0d1117';

  var nbSteps=4200, dt=0.0016;
  var bodies=[
    {m:6.0, x:0.00, y:0.00, vx:0.00, vy:0.00},
    {m:0.9, x:0.62, y:0.00, vx:0.00, vy:1.05},
    {m:0.45,x:-0.30,y:0.14, vx:-0.62,vy:-1.25}
  ];
  var G=0.45, soft=0.0006;
  var SAMP=520;
  var traj=[[],[],[]];
  var enc={t:1, sep:1e9};
  (function integrate(){
    function accel(){
      var ax=[0,0,0], ay=[0,0,0];
      for(var i=0;i<3;i++){ for(var j=0;j<3;j++){ if(i===j)continue;
        var dx=bodies[j].x-bodies[i].x, dy=bodies[j].y-bodies[i].y;
        var d2=dx*dx+dy*dy+soft, d=Math.sqrt(d2), f=G*bodies[j].m/(d2*d);
        ax[i]+=f*dx; ay[i]+=f*dy;
      }}
      return [ax,ay];
    }
    var sampleEvery=nbSteps/SAMP;
    var a=accel();
    for(var s=0;s<nbSteps;s++){
      for(var i=0;i<3;i++){ bodies[i].vx+=0.5*dt*a[0][i]; bodies[i].vy+=0.5*dt*a[1][i]; }
      for(var i=0;i<3;i++){ bodies[i].x+=dt*bodies[i].vx; bodies[i].y+=dt*bodies[i].vy; }
      a=accel();
      for(var i=0;i<3;i++){ bodies[i].vx+=0.5*dt*a[0][i]; bodies[i].vy+=0.5*dt*a[1][i]; }
      if(s % sampleEvery < 1){
        for(var i=0;i<3;i++) traj[i].push({x:bodies[i].x,y:bodies[i].y});
        var dx=bodies[1].x-bodies[2].x, dy=bodies[1].y-bodies[2].y, sep=Math.sqrt(dx*dx+dy*dy);
        if(sep<enc.sep){ enc.sep=sep; enc.t=traj[0].length-1; }
      }
    }
  })();
  var NS=traj[0].length;
  var P1DUR=28;

  var minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
  for(var i=0;i<3;i++)for(var k=0;k<NS;k++){var p=traj[i][k];if(p.x<minx)minx=p.x;if(p.x>maxx)maxx=p.x;if(p.y<miny)miny=p.y;if(p.y>maxy)maxy=p.y;}
  var cx0=(minx+maxx)/2, cy0=(miny+maxy)/2, span=Math.max(maxx-minx,maxy-miny)*1.18;

  var bands=[
    {name:'X-ray',  c:WHITE, logtp:-0.55, rise:1.6, decay:-1.25, amp:1.00},
    {name:'optical',c:AMBER, logtp: 0.15, rise:1.0, decay:-1.05, amp:0.90},
    {name:'radio',  c:GREEN, logtp: 1.15, rise:0.9, decay:-0.55, amp:0.78}
  ];
  var LT0=-1.5, LT1=2.5, LF0=-2.6, LF1=0.25;
  function fluxLog(b, lt){
    var x = Math.pow(10, lt - b.logtp), sh=1.4;
    var val = b.amp / Math.pow( Math.pow(x, -b.rise*sh) + Math.pow(x, -b.decay*sh), 1/sh );
    return Math.log10(val + 1e-6);
  }

  var T=60, start=null;
  function lerp(a,b,u){return a+(b-a)*u;}
  function clamp(v,a,b){return v<a?a:v>b?b:v;}
  function smooth(u){u=clamp(u,0,1);return u*u*(3-2*u);}

  function drawLabel(txt, alpha){
    if(alpha<=0.01)return;
    ctx.save(); ctx.globalAlpha=alpha; ctx.fillStyle=MUTED;
    ctx.font='10px ui-monospace, Menlo, monospace'; ctx.textBaseline='top';
    ctx.fillText(txt, 10, 9); ctx.restore();
  }
  function drawGrid(cx,cy,S,alpha){
    if(alpha<=0.01)return;
    ctx.save(); ctx.globalAlpha=alpha*0.5; ctx.strokeStyle='#1b2230'; ctx.lineWidth=1;
    var step=S*0.11;
    for(var gx=cx-Math.ceil(w/step)*step; gx<w; gx+=step){ if(gx<0)continue; ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,h);ctx.stroke(); }
    for(var gy=cy-Math.ceil(h/step)*step; gy<h; gy+=step){ if(gy<0)continue; ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(w,gy);ctx.stroke(); }
    ctx.restore();
  }

  function phase1(lp, fade){
    var cx=w/2, cy=h/2, S=Math.min(w,h), sc=S/span;
    function X(wx){return cx+(wx-cx0)*sc;}
    function Y(wy){return cy+(wy-cy0)*sc;}
    drawGrid(cx,cy,S,fade);
    var u=clamp(lp/P1DUR,0,1);
    var head=clamp(Math.floor(u*(NS-1)),1,NS-1);
    var trailLen=Math.floor(NS*0.55);
    for(var i=0;i<3;i++){
      var col=[WHITE,AMBER,GREEN][i];
      ctx.save(); ctx.lineCap='round';
      var startk=Math.max(0, head-trailLen);
      for(var k=startk+1;k<=head;k++){
        var p0=traj[i][k-1], p1=traj[i][k];
        var age=(head-k)/trailLen;
        ctx.globalAlpha=fade*(1-age)*0.85; ctx.strokeStyle=col;
        ctx.lineWidth=lerp(0.4,1.7,1-age);
        ctx.beginPath(); ctx.moveTo(X(p0.x),Y(p0.y)); ctx.lineTo(X(p1.x),Y(p1.y)); ctx.stroke();
      }
      ctx.restore();
    }
    for(var i=0;i<3;i++){
      var col=[WHITE,AMBER,GREEN][i], rad=[3.6,2.3,1.9][i], p=traj[i][head];
      ctx.save(); ctx.globalAlpha=fade; ctx.shadowColor=col; ctx.shadowBlur=10;
      ctx.fillStyle=col; ctx.beginPath(); ctx.arc(X(p.x),Y(p.y),rad,0,Math.PI*2); ctx.fill(); ctx.restore();
    }
    var encWindow=Math.abs(head-enc.t)/(NS*0.06);
    if(encWindow<1){
      var pa=traj[1][enc.t], pb=traj[2][enc.t];
      var mx=(X(pa.x)+X(pb.x))/2, my=(Y(pa.y)+Y(pb.y))/2, fl=(1-encWindow);
      ctx.save(); ctx.globalAlpha=fade*fl*0.9;
      var rg=ctx.createRadialGradient(mx,my,0,mx,my,S*0.14);
      rg.addColorStop(0,'rgba(230,237,243,0.9)');
      rg.addColorStop(0.4,'rgba(240,165,0,0.35)');
      rg.addColorStop(1,'rgba(13,16,22,0)');
      ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(mx,my,S*0.14,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=fade*fl; ctx.fillStyle=MUTED; ctx.font='9px ui-monospace, Menlo, monospace';
      ctx.fillText('chain-regularized close approach', 10, h-18); ctx.restore();
    }
    drawLabel('SPACEHUB - CLOSE ENCOUNTER', fade);
  }

  function phase2(lp, fade){
    var P2DUR=28;
    var u=smooth(clamp(lp/P2DUR,0,1));
    var pad=Math.min(w,h)*0.16;
    var x0=pad*0.95, y0=pad*0.55, x1=w-pad*0.7, y1=h-pad*0.95;
    function PX(lt){return lerp(x0,x1,(lt-LT0)/(LT1-LT0));}
    function PY(lf){return lerp(y1,y0,(lf-LF0)/(LF1-LF0));}
    ctx.save(); ctx.globalAlpha=fade*0.5; ctx.strokeStyle='#1b2230'; ctx.lineWidth=1;
    for(var d=Math.ceil(LT0); d<=Math.floor(LT1); d++){ var xx=PX(d); ctx.beginPath();ctx.moveTo(xx,y0);ctx.lineTo(xx,y1);ctx.stroke(); }
    for(var d=Math.ceil(LF0); d<=Math.floor(LF1); d++){ var yy=PY(d); ctx.beginPath();ctx.moveTo(x0,yy);ctx.lineTo(x1,yy);ctx.stroke(); }
    ctx.globalAlpha=fade*0.8; ctx.strokeStyle=MUTED; ctx.lineWidth=1.1;
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x0,y1); ctx.lineTo(x1,y1); ctx.stroke();
    ctx.globalAlpha=fade*0.85; ctx.fillStyle=MUTED; ctx.font='8px ui-monospace, Menlo, monospace';
    ctx.fillText('log Fv', x0-2, y0-11); ctx.fillText('log t', x1-26, y1+5); ctx.restore();
    var ltHead=lerp(LT0,LT1,u), STEPS=80;
    for(var bi=0;bi<bands.length;bi++){
      var b=bands[bi];
      ctx.save(); ctx.strokeStyle=b.c; ctx.lineWidth=1.6; ctx.lineCap='round'; ctx.lineJoin='round';
      ctx.shadowColor=b.c; ctx.shadowBlur=5; ctx.globalAlpha=fade; ctx.beginPath();
      var started=false, lastx=0,lasty=0;
      for(var s=0;s<=STEPS;s++){
        var lt=lerp(LT0,LT1,s/STEPS);
        if(lt>ltHead) break;
        var lf=fluxLog(b,lt), px=PX(lt), py=PY(clamp(lf,LF0,LF1));
        if(!started){ctx.moveTo(px,py);started=true;}else ctx.lineTo(px,py);
        lastx=px; lasty=py;
      }
      ctx.stroke();
      if(started){ ctx.shadowBlur=8; ctx.fillStyle=b.c; ctx.beginPath(); ctx.arc(lastx,lasty,2.2,0,Math.PI*2); ctx.fill(); }
      ctx.restore();
    }
    ctx.save(); ctx.globalAlpha=fade*0.9; ctx.font='8px ui-monospace, Menlo, monospace';
    var ly=y0+2;
    for(var bi=0;bi<bands.length;bi++){
      var b=bands[bi];
      ctx.fillStyle=b.c; ctx.fillRect(x1-52, ly, 8,2.5);
      ctx.fillStyle=MUTED; ctx.fillText(b.name, x1-40, ly-3); ly+=11;
    }
    ctx.restore();
    drawLabel('VEGASAFTERGLOW - LIGHT CURVES', fade);
  }

  function frame(ts){ if(start==null)start=ts; var t=(ts-start)/1000;
    if(w<2||h<2){ requestAnimationFrame(frame); return; }
    var lt=t%T;
    ctx.fillStyle=BG; ctx.fillRect(0,0,w,h);
    var cross=1.5;
    if(lt<30){
      var f1=1;
      if(lt<cross) f1=smooth(lt/cross); else if(lt>30-cross) f1=smooth((30-lt)/cross);
      phase1(lt, f1);
      if(lt>30-cross){ var f2=smooth((lt-(30-cross))/cross); phase2(0, f2); }
    } else {
      var lp=lt-30, f2=1;
      if(lp<cross) f2=smooth(lp/cross); else if(lp>30-cross) f2=smooth((30-lp)/cross);
      phase2(lp, f2);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};

  function boot(){ var c=document.querySelectorAll('canvas[data-theme]'); for(var i=0;i<c.length;i++){(function(cv){var n=parseInt(cv.getAttribute('data-theme'),10); try{ if(INIT[n]) INIT[n](cv);}catch(e){ if(window.console&&console.error) console.error('anim '+n,e);} })(c[i]);} }
  if(document.readyState!=='loading') boot(); else document.addEventListener('DOMContentLoaded',boot);
})();

(function(){
  var root=document.documentElement,motionOK=!matchMedia('(prefers-reduced-motion: reduce)').matches&&'IntersectionObserver' in window;
  var head=document.querySelector('.site-head');

  /* ---- Intro: winged gold ball flight → corner burst → gold wipe → griffin → title ----
     Pure function of time (draw(t)), so it can be replayed, skipped, or rendered to video. */
  document.querySelectorAll('.menu>li').forEach(function(li,n){li.style.setProperty('--n',n+1)});
  var intro=document.getElementById('intro'),cv=document.getElementById('intro-canvas'),skipIntro=function(){},playIntro=null;
  if(intro&&cv&&document.getElementById('griffin')){   /* intro markup is only on the home page */
  var cx=cv.getContext('2d');
  var GOLD='#ffa300',GOLD2='#fa9504',INK='#000000';
  var logoSym=document.getElementById('griffin'),LOGO=new Path2D(logoSym.querySelector('path').getAttribute('d'));
  var vb=logoSym.getAttribute('viewBox').split(/[\s,]+/).map(Number);
  var LC={x:vb[0]+vb[2]/2,y:vb[1]+vb[3]/2,r:Math.max(vb[2],vb[3])/2-2};
  var clamp=function(v,a,b){return v<a?a:v>b?b:v};
  var pg=function(t,a,b){return clamp((t-a)/(b-a),0,1)};
  var eOut=function(x){return 1-Math.pow(1-x,3)};
  var eInOut=function(x){return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2};
  var eBack=function(x,c){return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
  /* Closed-form damped spring (unit step): returns [position, velocity] */
  var spring=function(tau,k,c){var w=Math.sqrt(k),z=c/(2*w),wd=w*Math.sqrt(1-z*z),e=Math.exp(-z*w*tau);
    return [1-e*(Math.cos(wd*tau)+(z*w/wd)*Math.sin(wd*tau)),(w/Math.sqrt(1-z*z))*e*Math.sin(wd*tau)]};
  var LOGO_T0=1.38,VMAX=0,LAND_T=0;
  (function(){for(var q=0;q<1;q+=.002){var s=spring(q,170,12);if(s[1]>VMAX)VMAX=s[1];if(!LAND_T&&s[0]>=1)LAND_T=q}})();

  /* Flight path in 16×9 stage units: enter left → glide → rise → loop → whip → dart to top-right corner */
  var CP=[[-.05,.78],[.04,.79],[.12,.82],[.20,.82],[.28,.77],[.355,.66]],th;
  for(th=.55;th>=-5.2;th-=.45)CP.push([.33+.07*Math.cos(th),.5+.07*16/9*Math.sin(th)]);
  CP.push([.44,.52],[.56,.42],[.72,.29],[.87,.16],[1,.05],[1.05,.02]);
  var CORNER_I=CP.length-2;
  CP=CP.map(function(p){return [p[0]*16,p[1]*9]});
  var PTS=[],CUM=[0],NSEG=20,i,k;
  for(i=0;i<CP.length-1;i++){var p0=CP[Math.max(0,i-1)],p1=CP[i],p2=CP[i+1],p3=CP[Math.min(CP.length-1,i+2)];
    for(k=0;k<NSEG;k++){var u=k/NSEG,u2=u*u,u3=u2*u,pt=[0,0];
      for(var j=0;j<2;j++)pt[j]=.5*(2*p1[j]+(-p0[j]+p2[j])*u+(2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*u2+(-p0[j]+3*p1[j]-3*p2[j]+p3[j])*u3);
      PTS.push(pt)}}
  PTS.push(CP[CP.length-1]);
  for(i=1;i<PTS.length;i++)CUM.push(CUM[i-1]+Math.hypot(PTS[i][0]-PTS[i-1][0],PTS[i][1]-PTS[i-1][1]));
  /* Speed profile: slow enter → fast whip → fastest dart (one continuous throw) */
  var VK=[[.07,.35],[.33,.6],[.6,.9],[.73,2],[.93,2.3],[1.07,3],[1.22,4.2]];
  var vAt=function(t){for(var n=1;n<VK.length;n++)if(t<=VK[n][0]){var a=VK[n-1],b=VK[n],q=(t-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*q}return VK[VK.length-1][1]};
  var ST=[],DT=1/480,acc=0,tt;for(tt=.07;tt<=1.22+1e-9;tt+=DT){ST.push(acc);acc+=vAt(tt)*DT}
  var LC_END=CUM[CORNER_I*NSEG],SSC=LC_END/ST[ST.length-1];
  var sAt=function(t){if(t<=.07)return 0;if(t>=1.22)return LC_END;var f=(t-.07)/DT,n=Math.floor(f),n2=Math.min(n+1,ST.length-1);return (ST[n]+(ST[n2]-ST[n])*(f-n))*SSC};
  var posAt=function(s){var lo=0,hi=CUM.length-1;while(hi-lo>1){var m=(lo+hi)>>1;if(CUM[m]<s)lo=m;else hi=m}
    var seg=CUM[hi]-CUM[lo]||1,q=clamp((s-CUM[lo])/seg,0,1);return [PTS[lo][0]+(PTS[hi][0]-PTS[lo][0])*q,PTS[lo][1]+(PTS[hi][1]-PTS[lo][1])*q]};

  /* Layout: flight happens in a 16:9 stage fitted to the screen; the wipe and final frame fill the whole screen */
  var W,H,DPR,SW,SH,SX,SY,U;
  var resize=function(){var d=Math.min(2,window.devicePixelRatio||1),w=window.innerWidth,h=window.innerHeight;
    /* Resetting a canvas clears it, so only do it when the size really changed (prevents a blank frame at handoff) */
    if(d!==DPR||w!==W||h!==H){DPR=d;W=w;H=h;cv.width=Math.round(W*DPR);cv.height=Math.round(H*DPR)}
    SW=Math.min(W,H*16/9);SH=SW*9/16;SX=(W-SW)/2;SY=(H-SH)/2;U=Math.min(H,W*1.1)};
  var px=function(p){return [SX+p[0]/16*SW,SY+p[1]/9*SH]};
  var at=function(t){return px(posAt(sAt(t)))};

  /* Simple eagle wing (units of ball radius; +x = forward, +y = out from the body), 4 primary "finger" feathers */
  var WING=[[.5,.45],[1.05,1.2],[1,2.1],[.75,2.9],[.55,3.9],[.3,3.15],[.15,4],[-.05,3.15],[-.25,3.9],[-.4,3.05],[-.65,3.65],[-.75,2.8],[-1,2],[-1.15,1.3],[-.9,.75],[-.55,.45]];
  var drawWing=function(p,ang,R,side,span,sweep,color,alpha){if(alpha<=0)return;
    cx.save();cx.translate(p[0],p[1]);cx.rotate(ang);cx.scale(R*.82,R*.82);cx.globalAlpha=alpha;cx.fillStyle=color;cx.beginPath();
    var tn=Math.tan(sweep);
    WING.forEach(function(q,n){var ly=.5+(q[1]-.5)*span,lx=q[0]-(q[1]-.5)*span*tn;if(n)cx.lineTo(lx,side*ly);else cx.moveTo(lx,side*ly)});
    cx.closePath();cx.lineJoin='round';cx.fill();cx.restore()};
  var wingState=function(t){if(t<.07||t>=1.2)return null;
    var s={span:.12+.88*eOut(pg(t,.07,.33)),sweep:0,alpha:1,bank:1};
    if(t>=.33&&t<.73){var ph=((t-.33)/.2)%1;s.span=.42+.58*(.5+.5*Math.cos(ph*2*Math.PI))}
    if(t>=.73&&t<.93){s.span=1;s.bank=.72}
    if(t>=.93){var f=eInOut(pg(t,.93,1.16));s.span=1-.86*f;s.sweep=1.05*f;s.alpha=1-pg(t,1.06,1.18)}
    return s};

  var speedLines=function(t,R,amt){cx.save();cx.strokeStyle=GOLD;cx.lineCap='round';cx.lineJoin='round';
    [[.75,.13,.03,.08],[-.9,.11,.04,.07],[1.25,.09,.055,.06]].forEach(function(L){cx.lineWidth=Math.max(1,R*L[3]);cx.beginPath();var first=true;
      for(var n=0;n<=12;n++){var t1=t-L[2]-L[1]*(1-n/12);if(t1<.07)continue;var P=at(t1),P2=at(t1+.004),dx=P2[0]-P[0],dy=P2[1]-P[1],d=Math.hypot(dx,dy);if(d<.01)continue;
        var x=P[0]-dy/d*L[0]*R,y=P[1]+dx/d*L[0]*R;if(first){cx.moveTo(x,y);first=false}else cx.lineTo(x,y)}
      cx.globalAlpha=.85*amt;cx.stroke()});cx.restore()};

  var flight=function(t){
    if(t<.07)return;
    var R=Math.max(SW*.015,8),p=at(t),a=at(Math.max(.0701,t-.004)),b=at(Math.min(1.2199,t+.004));
    var ang=Math.atan2(b[1]-a[1],b[0]-a[0]),spd=Math.hypot(b[0]-a[0],b[1]-a[1])/.008/SW;
    var Rh=R+(SW*.09-R)*eInOut(pg(t,1.13,1.27));
    var sl=pg(t,.58,.66)*(1-pg(t,1.05,1.15));if(sl>0)speedLines(t,R,sl);
    /* Comet tail: tapered body along the recent path */
    var tail=[],n;for(n=0;n<=16;n++){var t1=t-.07*(1-n/16);if(t1>=.07)tail.push(at(t1))}
    if(tail.length>2){var L=[],Rt=[];for(n=0;n<tail.length;n++){var A=tail[Math.max(0,n-1)],B=tail[Math.min(tail.length-1,n+1)],dx=B[0]-A[0],dy=B[1]-A[1],d=Math.hypot(dx,dy)||1,w=R*Math.pow(n/(tail.length-1),.7);
        L.push([tail[n][0]-dy/d*w,tail[n][1]+dx/d*w]);Rt.push([tail[n][0]+dy/d*w,tail[n][1]-dx/d*w])}
      cx.fillStyle=GOLD;cx.beginPath();cx.moveTo(L[0][0],L[0][1]);for(n=1;n<L.length;n++)cx.lineTo(L[n][0],L[n][1]);for(n=Rt.length-1;n>=0;n--)cx.lineTo(Rt[n][0],Rt[n][1]);cx.closePath();cx.fill()}
    /* Wings: far wing (slightly deeper gold) behind, near wing in front */
    var ws=wingState(t);
    if(ws){drawWing(p,ang,R,-1,ws.span*ws.bank,ws.sweep,GOLD2,ws.alpha)}
    /* Head + soft motion-blurred leading edge */
    var blur=clamp(spd/.9,0,1)*(1-pg(t,1.18,1.26));
    cx.save();cx.globalAlpha=1;cx.fillStyle=GOLD;
    if(blur>0){cx.shadowColor=GOLD;cx.shadowBlur=R*.9*blur*DPR;cx.shadowOffsetX=Math.cos(ang)*R*.45*blur*DPR;cx.shadowOffsetY=Math.sin(ang)*R*.45*blur*DPR}
    cx.beginPath();cx.arc(p[0],p[1],Rh,0,7);cx.fill();cx.restore();
    if(ws)drawWing(p,ang,R,1,ws.span,ws.sweep,GOLD,ws.alpha);
  };

  var TITLE='LOS AL ROBOTICS',SUB='FRC TEAM 6220';
  var DISPLAY='Karnivore, Orbitron, "Arial Black", system-ui, sans-serif',BODY='Jura, "Segoe UI", system-ui, sans-serif';
  var finalFrame=function(t){
    /* Logo: one solid shape (no clipping); spring drop-in with squash & stretch, damped wobble,
       one ripple on landing, then gentle breathing during the hold. Not affected by the text drift. */
    var LH=.30*U,lx=W/2,ly=H/2-.085*U,base=LH/(2*LC.r),tau=t-LOGO_T0;
    if(tau>0){
      var sp=spring(tau,170,12),x=sp[0],v=sp[1];
      var rot=-8*Math.PI/180*Math.exp(-.3*13.04*tau)*Math.cos(13.04*Math.sqrt(1-.09)*tau);
      var sc=.7+.3*x,yoff=(1-x)*(-.10*H);
      var sy=clamp(1+.08*Math.min(1,Math.abs(v)/VMAX)-.5*Math.max(0,x-1),.88,1.1),sx=1/sy;
      var idle=t>3.2?1+.01*(1-Math.cos(2*Math.PI*(t-3.2)/1.6)):1;
      cx.save();cx.globalAlpha=Math.min(1,tau/.08);cx.translate(lx,ly+yoff+LH/2*sc);cx.rotate(rot);
      cx.scale(sx*sc*idle*base,sy*sc*idle*base);cx.translate(-LC.x,-(LC.y+LC.r));cx.fillStyle=INK;cx.fill(LOGO,'evenodd');cx.restore();
      var rq=(tau-LAND_T)/.4;
      if(rq>0&&rq<1){cx.save();cx.globalAlpha=1-rq;cx.strokeStyle=INK;cx.lineWidth=Math.max(1.5,2*U/1080);
        cx.beginPath();cx.arc(lx,ly+yoff+LH/2*sc*(1-sy),LH/2*sc*(1+.4*eOut(rq)),0,7);cx.stroke();cx.restore()}
    }
    var drift=1+.01*pg(t,3.2,4.1);
    cx.save();cx.translate(W/2,H/2);cx.scale(drift,drift);cx.translate(-W/2,-H/2);
    /* Title: letters rise from below one by one with a slight wave */
    if(t>=1.75){var fs=.068*U;cx.font='700 '+fs+'px '+DISPLAY;var sp=.04*fs,ws=[],tot=0,n;
      for(n=0;n<TITLE.length;n++){ws.push(TITLE[n]===' '?fs*.32:cx.measureText(TITLE[n]).width);tot+=ws[n]+(n?sp:0)}
      if(tot>W*.86){var r=W*.86/tot;fs*=r;sp*=r;tot*=r;cx.font='700 '+fs+'px '+DISPLAY;ws=ws.map(function(v){return v*r})}
      var capH=fs*.72,base=H/2+.17*U+capH/2,x=W/2-tot/2,li=0;cx.fillStyle=INK;cx.textBaseline='alphabetic';
      for(n=0;n<TITLE.length;n++){if(TITLE[n]!==' '){var st=1.75+li*.075,q=pg(t,st,st+.35);
          if(q>0){cx.globalAlpha=eOut(pg(t,st,st+.2));cx.fillText(TITLE[n],x,base+(1-eBack(q,1.7))*.6*capH)}li++}
        x+=ws[n]+sp}
      cx.globalAlpha=1}
    /* Subtitle */
    var sa=eOut(pg(t,2.8,3.2));
    if(sa>0){var fs2=Math.max(12,.026*U);cx.font='600 '+fs2+'px '+BODY;var ls=.3*fs2,w2=[],tw=0,m;
      for(m=0;m<SUB.length;m++){w2.push(cx.measureText(SUB[m]).width);tw+=w2[m]+(m<SUB.length-1?ls:0)}
      var x2=W/2-tw/2,y2=H/2+.26*U+(1-sa)*8*U/1080;cx.globalAlpha=sa;cx.fillStyle=INK;
      for(m=0;m<SUB.length;m++){cx.fillText(SUB[m],x2,y2);x2+=w2[m]+ls}cx.globalAlpha=1}
    cx.restore()};

  var draw=function(t){
    cx.setTransform(DPR,0,0,DPR,0,0);cx.globalAlpha=1;cx.fillStyle=INK;cx.fillRect(0,0,W,H);
    var corner=px([16,.45]);
    if(t<1.47)flight(t);
    if(t>=1.27){var wk=eInOut(pg(t,1.27,1.47)),r0=SW*.09,far=Math.max(Math.hypot(corner[0],corner[1]),Math.hypot(corner[0],H-corner[1]),Math.hypot(W-corner[0],corner[1]),Math.hypot(W-corner[0],H-corner[1]));
      cx.fillStyle=GOLD;if(wk>=1)cx.fillRect(0,0,W,H);else{cx.beginPath();cx.arc(corner[0],corner[1],r0+(far-r0)*wk,0,7);cx.fill()}}
    if(t>=1.4)finalFrame(t)};

  /* Playback */
  var raf=0,t0=0,END=4.1,MS=null,mraf=0,MDUR=.85;
  var heroH1=document.querySelector('.hero h1'),heroEb=document.querySelector('.hero .eyebrow');
  var finishIntro=function(){cancelAnimationFrame(raf);cancelAnimationFrame(mraf);clearTimeout(intro._t);clearTimeout(intro._w);MS=null;intro.classList.remove('morph','done');
    root.classList.remove('intro-on','intro-rm','mh-logo','mh-h1','mh-eb','eb-wait','nav-in','morph-late');try{sessionStorage.setItem('g6220-intro','1')}catch(e){}};
  /* Fallback / reduced motion: plain crossfade */
  var endIntro=function(){if(!root.classList.contains('intro-on')||intro.classList.contains('done'))return;cancelAnimationFrame(raf);clearTimeout(intro._t);
    intro.classList.add('done');setTimeout(finishIntro,root.classList.contains('intro-rm')?200:500)};

  /* ---- Intro → website morph: the iris closes onto the header logo while the logo, title letters, and subtitle
     fly along gentle arcs onto their real counterparts, then hand off to the real DOM (FLIP / shared-element style). */
  var RGB_INK=[0,0,0],RGB_GOLD=[255,163,0],RGB_WHITE=[255,255,255];
  var mix=function(a,b,c){return 'rgb('+Math.round(a[0]+(b[0]-a[0])*c)+','+Math.round(a[1]+(b[1]-a[1])*c)+','+Math.round(a[2]+(b[2]-a[2])*c)+')'};
  var bez=function(a,b,c,p){var q=1-p;return q*q*a+2*q*p*b+p*p*c};
  var settle=function(u,amt){return eInOut(u)+amt*Math.sin(Math.PI*pg(u,.7,1))};
  var asc=function(font,fallback){cx.font=font;var m=cx.measureText('H');return m.fontBoundingBoxAscent||fallback};
  var prepareMorph=function(){
    var home=document.getElementById('home');if(!home||!home.classList.contains('current'))return null;
    var tl=document.querySelector('.center-logo svg'),eb=heroEb&&heroEb.querySelector('.eb-a');if(!tl||!heroH1||!eb)return null;
    var lr=tl.getBoundingClientRect();if(!lr.width||lr.bottom<0)return null;
    var s={},drift=1.01,D=function(x,y){return [W/2+(x-W/2)*drift,H/2+(y-H/2)*drift]};
    /* Logo: exact state of the intro's last frame → header logo */
    var LH=.30*U,base=LH/(2*LC.r),idle=1+.01*(1-Math.cos(2*Math.PI*(END-3.2)/1.6));
    s.l0=[W/2,H/2-.085*U+LH/2*(1-idle)];s.k0=base*idle;
    s.l1=[lr.left+lr.width/2,lr.top+lr.height/2];s.k1=Math.min(lr.width/vb[2],lr.height/vb[3]);
    s.far=Math.max(Math.hypot(s.l1[0],s.l1[1]),Math.hypot(W-s.l1[0],s.l1[1]),Math.hypot(s.l1[0],H-s.l1[1]),Math.hypot(W-s.l1[0],H-s.l1[1]));
    /* Title letters: same layout math as the intro → each letter of the hero headline */
    var fs=.068*U,n;cx.font='700 '+fs+'px '+DISPLAY;var sp=.04*fs,ws=[],tot=0;
    for(n=0;n<TITLE.length;n++){ws.push(TITLE[n]===' '?fs*.32:cx.measureText(TITLE[n]).width);tot+=ws[n]+(n?sp:0)}
    if(tot>W*.86){var r=W*.86/tot;fs*=r;sp*=r;tot*=r;ws=ws.map(function(v){return v*r})}
    var bl=H/2+.17*U+fs*.36,x=W/2-tot/2,from=[];
    for(n=0;n<TITLE.length;n++){if(TITLE[n]!==' ')from.push({ch:TITLE[n],a:D(x,bl),s0:fs*drift});x+=ws[n]+sp}
    var hs=getComputedStyle(heroH1),hfs=parseFloat(hs.fontSize),hasc=asc(hs.fontWeight+' '+hfs+'px '+hs.fontFamily,hfs*.8);
    var spans=heroH1.querySelectorAll('.h1-glyphs .w>span');if(spans.length!==from.length)return null;
    s.title=from.map(function(g,i){var rr=spans[i].getBoundingClientRect();return {ch:g.ch,a:g.a,s0:g.s0,f0:hs.fontFamily,w0:'700',b:[rr.left,rr.top+hasc],s1:hfs,f1:hs.fontFamily,w1:hs.fontWeight}});
    /* Subtitle letters → "FRC Team 6220" at the start of the hero eyebrow (font crossfades Jura → label font) */
    var fs2=Math.max(12,.026*U),m;cx.font='600 '+fs2+'px '+BODY;var ls=.3*fs2,w2=[],tw=0;
    for(m=0;m<SUB.length;m++){w2.push(cx.measureText(SUB[m]).width);tw+=w2[m]+(m<SUB.length-1?ls:0)}
    var x2=W/2-tw/2,y2=H/2+.26*U,sf=[];
    for(m=0;m<SUB.length;m++){if(SUB[m]!==' ')sf.push({ch:SUB[m],a:D(x2,y2),s0:fs2*drift});x2+=w2[m]+ls}
    var es=getComputedStyle(eb),efs=parseFloat(es.fontSize),easc=asc(es.fontWeight+' '+efs+'px '+es.fontFamily,efs*.8);
    var esp=eb.querySelectorAll('.w>span');if(esp.length!==sf.length)return null;
    s.sub=sf.map(function(g,i){var rr=esp[i].getBoundingClientRect();return {ch:g.ch,a:g.a,s0:g.s0,f0:BODY,w0:'600',b:[rr.left,rr.top+easc],s1:efs,f1:es.fontFamily,w1:es.fontWeight}});
    return s};
  var glyphs=function(list,mt,start,stag,end,lift,toRGB,ir,ov){var dur=end-start-stag*(list.length-1);
    cx.textBaseline='alphabetic';
    list.forEach(function(g,i){var d=start+i*stag,P=settle(pg(mt,d,d+dur),ov),mx=(g.a[0]+g.b[0])/2,my=(g.a[1]+g.b[1])/2-lift*H;
      var X=bez(g.a[0],mx,g.b[0],P),Y=bez(g.a[1],my,g.b[1],P),size=g.s0+(g.s1-g.s0)*P;
      var dd=Math.hypot(X+size*.3-MS.l1[0],Y-size*.35-MS.l1[1]);cx.fillStyle=mix(RGB_INK,toRGB,eInOut(clamp((dd-ir)/(size*.7)+.5,0,1)));
      if(g.f0!==g.f1){var fx=eInOut(pg(P,.25,.75));cx.globalAlpha=1-fx;cx.font=g.w0+' '+size+'px '+g.f0;cx.fillText(g.ch,X,Y);cx.globalAlpha=fx;cx.font=g.w1+' '+size+'px '+g.f1;cx.fillText(g.ch,X,Y);cx.globalAlpha=1}
      else{cx.font=g.w1+' '+size+'px '+g.f1;cx.fillText(g.ch,X,Y)}})};
  var drawMorph=function(mt){var s=MS;cx.setTransform(DPR,0,0,DPR,0,0);cx.clearRect(0,0,W,H);
    var iu=pg(mt,0,.7),ir=s.far*(1-eInOut(iu));if(iu<1){cx.fillStyle=GOLD;cx.beginPath();cx.arc(s.l1[0],s.l1[1],ir,0,7);cx.fill()}
    if(mt<.75){var P=settle(pg(mt,.05,.75),.03),mx=(s.l0[0]+s.l1[0])/2,my=(s.l0[1]+s.l1[1])/2-.15*H,k=s.k0+(s.k1-s.k0)*P;
      var X=bez(s.l0[0],mx,s.l1[0],P),Y=bez(s.l0[1],my,s.l1[1],P),lr=k*LC.r,out=clamp((Math.hypot(X-s.l1[0],Y-s.l1[1])+lr-ir)/(1.2*lr),0,1);
      cx.save();cx.translate(X,Y);cx.scale(k,k);cx.translate(-LC.x,-LC.y);
      cx.fillStyle=mix(RGB_INK,RGB_GOLD,eInOut(out));cx.fill(LOGO,'evenodd');cx.restore()}
    if(mt<.85)glyphs(s.title,mt,.10,.018,.85,.06,RGB_GOLD,iu<1?ir:0,.04);
    if(mt<.75)glyphs(s.sub,mt,.10,.012,.75,.04,RGB_WHITE,iu<1?ir:0,0)};
  var applyMorph=function(mt){
    if(mt>=.6)root.classList.add('nav-in','morph-late');
    if(mt>=.7)root.classList.remove('eb-wait');
    if(mt>=.75)root.classList.remove('mh-logo','mh-eb');
    if(mt>=.85)root.classList.remove('mh-h1')};
  var heroPic=document.getElementById('hero-img'),heroReady=false;
  var decodeHero=function(){if(heroReady)return;var ok=function(){heroReady=true};
    if(!heroPic){ok();return}try{(heroPic.decode?heroPic.decode():Promise.resolve()).then(ok,ok)}catch(e){ok()}};
  var startMorph=function(fast,waited){if(MS||!root.classList.contains('intro-on')||intro.classList.contains('done'))return;
    cancelAnimationFrame(raf);clearTimeout(intro._t);clearTimeout(intro._w);
    if(root.classList.contains('intro-rm')){endIntro();return}
    /* Hold the current intro frame until the hero photo is decoded (max 300ms) so it never pops in late */
    if(!heroReady&&(waited||0)<300){intro._w=setTimeout(function(){startMorph(fast,(waited||0)+50)},50);return}
    window.scrollTo({top:0,left:0,behavior:'instant'});MS=prepareMorph();if(!MS){endIntro();return}
    /* Paint the first morph frame (full-screen gold) BEFORE the overlay becomes transparent: no frame shows the bare page */
    drawMorph(0);intro.classList.add('morph');var speed=fast?.45/1.1:1,m0=performance.now();
    var step=function(now){var mt=(now-m0)/1000/speed;drawMorph(Math.min(mt,MDUR));applyMorph(mt);if(mt>=MDUR){finishIntro();return}mraf=requestAnimationFrame(step)};
    mraf=requestAnimationFrame(step)};

  var tick=function(now){var t=(now-t0)/1000;draw(Math.min(t,END));if(t>=END){startMorph(false);return}raf=requestAnimationFrame(tick)};
  var playIntro=function(still){cancelAnimationFrame(raf);cancelAnimationFrame(mraf);clearTimeout(intro._t);clearTimeout(intro._w);decodeHero();MS=null;intro.classList.remove('done','morph');
    if(heroH1)heroH1.classList.remove('load');if(heroEb)heroEb.classList.remove('load');
    root.classList.remove('nav-in','morph-late');root.classList.add('intro-on','mh-logo','mh-h1','mh-eb','eb-wait');resize();
    if(still){draw(3.2);intro._t=setTimeout(endIntro,1000)}else{t0=performance.now();raf=requestAnimationFrame(tick)}
    document.getElementById('intro-skip').focus({preventScroll:true})};
  window.addEventListener('resize',function(){if(root.classList.contains('intro-on')&&!MS){resize();if(root.classList.contains('intro-rm'))draw(3.2)}});
  try{document.fonts.load('700 40px Karnivore');document.fonts.load('700 40px Orbitron');document.fonts.load('600 20px Jura')}catch(e){}
  skipIntro=function(){startMorph(true)};
  document.getElementById('intro-skip').addEventListener('click',skipIntro);
  window.__g6220Intro={render:function(t){root.classList.add('intro-on');resize();draw(t)},
    morphAt:function(mt){if(!MS){MS=prepareMorph();intro.classList.add('morph')}drawMorph(mt);applyMorph(mt)}};
  if(root.classList.contains('intro-on'))playIntro(root.classList.contains('intro-rm'));
  }else root.classList.remove('intro-on','intro-rm');
  /* Replay intro (footer): plays here on the home page; elsewhere it opens the home page, which plays it */
  var replayBtn=document.getElementById('replay');
  if(replayBtn)replayBtn.addEventListener('click',function(){
    if(!playIntro){try{sessionStorage.removeItem('g6220-intro')}catch(e){}location.href='/';return}
    window.scrollTo({top:0,left:0,behavior:'instant'});
    playIntro(matchMedia('(prefers-reduced-motion: reduce)').matches?(root.classList.add('intro-rm'),true):false)});

  /* ---- Menu ---- */
  var btn=document.getElementById('menu-btn'),nav=document.getElementById('site-nav');
  var closeSubs=function(except){nav.querySelectorAll('.has-sub.open').forEach(function(li){if(li!==except){li.classList.remove('open');li.querySelector('.sub-btn').setAttribute('aria-expanded','false')}})};
  var closeMenu=function(){nav.classList.remove('open');btn.setAttribute('aria-expanded','false');btn.textContent='MENU';closeSubs()};
  btn.addEventListener('click',function(){var o=nav.classList.toggle('open');btn.setAttribute('aria-expanded',o);btn.textContent=o?'CLOSE':'MENU'});
  nav.querySelectorAll('.has-sub>.sub-btn').forEach(function(b){b.addEventListener('click',function(){var li=b.parentNode,o=!li.classList.contains('open');closeSubs(li);li.classList.toggle('open',o);b.setAttribute('aria-expanded',o)})});
  /* Desktop: hover or keyboard focus also opens a dropdown (CSS). Keep aria-expanded in step; Escape shuts it. */
  var mobileMenu=function(){return getComputedStyle(btn).display!=='none'};
  var syncSub=function(li){var b=li.querySelector('.sub-btn');b.setAttribute('aria-expanded',String(li.classList.contains('open')||!mobileMenu()&&!li.classList.contains('shut')&&(li.matches(':hover')||li.matches(':focus-within'))))};
  nav.querySelectorAll('.has-sub').forEach(function(li){
    li.addEventListener('mouseenter',function(){syncSub(li)});
    li.addEventListener('mouseleave',function(){li.classList.remove('shut');syncSub(li)});
    li.addEventListener('focusin',function(e){if(e.target!==li.querySelector(':scope>a'))li.classList.remove('shut');syncSub(li)});
    li.addEventListener('focusout',function(){setTimeout(function(){if(!li.contains(document.activeElement))li.classList.remove('shut');syncSub(li)},0)})});
  document.addEventListener('click',function(e){if(!e.target.closest('.nav')&&!e.target.closest('#menu-btn'))closeSubs()});
  document.addEventListener('keydown',function(e){if(e.key!=='Escape')return;
    if(root.classList.contains('intro-on')){skipIntro();return}
    var o=nav.querySelector('.has-sub.open>.sub-btn');closeSubs();
    if(nav.classList.contains('open')){closeMenu();btn.focus();return}
    var li=document.activeElement&&document.activeElement.closest?document.activeElement.closest('.has-sub'):null;
    if(li&&nav.contains(li)){li.classList.add('shut');li.querySelector(':scope>a').focus();syncSub(li)}else if(o)o.focus()});
  /* ---- Scroll: header size, progress line, hero parallax ---- */
  var prog=document.getElementById('progress'),heroImg=document.getElementById('hero-img'),ticking=false;
  var onScroll=function(){ticking=false;head.classList.toggle('scrolled',scrollY>40);
    var max=document.documentElement.scrollHeight-innerHeight;prog.style.transform='scaleX('+(max>0?Math.min(1,scrollY/max):0)+')';
    if(motionOK&&scrollY<innerHeight*1.2){if(heroImg)heroImg.style.transform='translate3d(0,'+(scrollY*.12).toFixed(1)+'px,0)';var bi=document.querySelector('.page.current .ph-img');if(bi)bi.style.transform='translate3d(0,'+(scrollY*.12).toFixed(1)+'px,0)'}};
  /* Depth: decorative layers move at different speeds (0.6× back, 0.8× middle, 1.1× front), max ±60px */
  var pxEls=[].slice.call(document.querySelectorAll('.px')),echoEl=document.querySelector('.h1-echo'),homeEl=document.getElementById('home');
  var depthScroll=function(){if(!motionOK)return;var mid=innerHeight/2;
    pxEls.forEach(function(el){if(!el.offsetParent&&!(el instanceof SVGElement&&el.closest('.page.current')))return;var r=el.getBoundingClientRect(),ty=el._ty||0,d=r.top+r.height/2-ty-mid,k=1-parseFloat(el.dataset.depth);
      var n=Math.max(-60,Math.min(60,-d*k));el._ty=n;el.style.transform='translate3d(0,'+n.toFixed(1)+'px,0)'});
    if(echoEl){var h=echoEl.parentNode.getBoundingClientRect();echoEl.parentNode.style.setProperty('--echo-y',Math.max(-30,Math.min(30,-(h.top+h.height/2-mid)*.08)).toFixed(1)+'px')}};
  var _onScroll=onScroll;onScroll=function(){_onScroll();depthScroll()};
  addEventListener('scroll',function(){if(!ticking){ticking=true;requestAnimationFrame(onScroll)}},{passive:true});
  addEventListener('resize',onScroll);

  /* ---- Reveals and timeline ---- */
  var io=motionOK&&new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.remove('pre');io.unobserve(en.target)}})},{rootMargin:'0px 0px -8% 0px'});
  var tl=document.getElementById('tl'),tlOn=false;
  var drawTl=function(){if(!tlOn||!tl)return;var r=tl.getBoundingClientRect(),p=Math.max(0,Math.min(1,(innerHeight*.7-r.top)/r.height));tl.style.setProperty('--p',p.toFixed(3))};
  addEventListener('scroll',function(){requestAnimationFrame(drawTl)},{passive:true});

  var arm=function(page){
    if(!motionOK)return;
    page.querySelectorAll('.rv,.tl li,.budget').forEach(function(el){
      el.classList.add('pre');io.observe(el);
    });
    tlOn=!!tl&&page.contains(tl);if(tlOn){tl.style.setProperty('--p','0');requestAnimationFrame(drawTl)}
  };

  /* ---- Pages: each page is its own address. Same-site links play the page-change loader (page-loader.js). ---- */
  var current=document.querySelector('.page.current');
  if(current){arm(current);onScroll()}
  document.addEventListener('click',function(e){
    if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    var a=e.target.closest('a[href]');if(!a||(a.target&&a.target!=='_self')||a.hasAttribute('download'))return;
    var u;try{u=new URL(a.href,location.href)}catch(err){return}
    if(u.origin!==location.origin)return;
    var norm=function(p){return p.replace(/\/index\.html$|\.html$/,'').replace(/\/$/,'')||'/'};
    if(norm(u.pathname)===norm(location.pathname)&&u.search===location.search){
      if(u.hash&&u.hash!=='#')return;            /* in-page anchor: the browser scrolls */
      e.preventDefault();closeMenu();if(document.activeElement&&nav.contains(document.activeElement))document.activeElement.blur();
      window.scrollTo({top:0,behavior:motionOK?'smooth':'auto'});return}  /* this page's tab: back to the top */
    if(/^\/(apps|assets|gal)(\/|$)/.test(u.pathname))return;   /* apps have their own pages */
    if(!motionOK||!window.G6220Loader||!G6220Loader.go||!window.G6220PageNav||root.classList.contains('intro-on'))return;
    /* The loader only appears if the next page is not ready within LOADER_DELAY_MS (packages/assets/scripts/page-nav.js). */
    e.preventDefault();closeMenu();
    G6220PageNav.go(u.href,function(){if(G6220Loader.busy)location.href=u.href;else G6220Loader.go(u.href)});
  });


  /* ---- Robot showcase ---- */
  var ROBOTS=[];try{ROBOTS=JSON.parse(document.getElementById('robots-data').textContent)}catch(e){}
  var sc=document.getElementById('showcase');
  if(sc&&ROBOTS.length){var rtabs=[].slice.call(sc.querySelectorAll('.rtab')),rI=0;
    var fill=function(i){var r=ROBOTS[i];var im=document.getElementById('rs-img');var iu=null;try{iu=new URL(r.img,location.href)}catch(err){}if(iu&&/^https?:$/.test(iu.protocol))im.src=iu.href;im.alt=r.alt;
      document.getElementById('rs-season').textContent=r.year;document.getElementById('rs-plate').textContent=r.year+' · '+r.game;document.getElementById('rs-game').textContent=r.game;
      document.getElementById('rs-name').textContent=r.name;var qc=document.getElementById('rs-quip-c');if(qc)qc.textContent='a teammate, on '+r.name;document.getElementById('rs-finish').textContent=r.finish;var q=document.getElementById('rs-quip');if(r.quip){document.getElementById('rs-quip-t').textContent='“'+r.quip+'”';q.hidden=false}else{q.hidden=true}
      var ul=document.getElementById('rs-events');ul.innerHTML='';r.events.forEach(function(e){var li=document.createElement('li');li.textContent=e;ul.appendChild(li)});
      var ph=document.getElementById('rs-photos');ph.href=r.album?'/resources/media#'+r.album:'/resources/media';
      var cad=document.getElementById('rs-cad');if(cad){var cu=null;try{cu=r.cad?new URL(r.cad,location.href):null}catch(err){}if(cu&&/^https?:$/.test(cu.protocol)){cad.href=cu.href;cad.hidden=false}else{cad.removeAttribute('href');cad.hidden=true}}ph.textContent=r.album?'See '+r.year+' photos →':'See all photos →';
      document.getElementById('robot-panel').setAttribute('aria-labelledby','rtab-'+r.year)};
    var pick=function(i,focus){i=(i+ROBOTS.length)%ROBOTS.length;if(i===rI&&!focus)return;rI=i;
      rtabs.forEach(function(b,k){b.setAttribute('aria-selected',String(k===i));b.tabIndex=k===i?0:-1});if(focus)rtabs[i].focus();
      if(!motionOK){fill(i);return}sc.classList.add('swap');setTimeout(function(){fill(i);sc.classList.add('drop');sc.classList.remove('swap');requestAnimationFrame(function(){requestAnimationFrame(function(){sc.classList.remove('drop')})})},200)};
    rtabs.forEach(function(b,k){b.addEventListener('click',function(){pick(k)});
      b.addEventListener('keydown',function(e){var d={ArrowRight:1,ArrowLeft:-1,ArrowDown:1,ArrowUp:-1}[e.key];
        if(d){e.preventDefault();pick(rI+d,true)}else if(e.key==='Home'){e.preventDefault();pick(0,true)}else if(e.key==='End'){e.preventDefault();pick(ROBOTS.length-1,true)}})});
    var rsx=null,si=sc.querySelector('.stage-img');si.addEventListener('pointerdown',function(e){rsx=e.clientX});
    si.addEventListener('pointerup',function(e){if(rsx===null)return;var dx=e.clientX-rsx;rsx=null;if(Math.abs(dx)>50)pick(rI+(dx<0?1:-1))});
    ROBOTS.forEach(function(r){var p=new Image();p.src=r.img});
    /* /robots#2025 opens that season */
    var byHash=function(){var y=location.hash.slice(1),k=-1;ROBOTS.forEach(function(r,i){if(r.year===y)k=i});return k};
    var h0=byHash();if(h0>0){rI=h0;rtabs.forEach(function(b,k){b.setAttribute('aria-selected',String(k===h0));b.tabIndex=k===h0?0:-1})}fill(rI);
    addEventListener('hashchange',function(){var k=byHash();if(k>=0){pick(k);sc.scrollIntoView({behavior:motionOK?'smooth':'auto'})}});if(typeof dio!=='undefined'&&dio)dio.observe(document.getElementById('stage-img'))}
  /* ---- Gallery: albums, filter, album view, lightbox ---- */
  var GAL=[{"slug": "beach-blitz-2025", "name": "Beach Blitz", "season": "2025", "game": "REEFSCAPE offseason", "tag": null, "photos": [{"alt": "Team members working on laptops at an outdoor table", "tw": 640, "th": 427}, {"alt": "Students working on the robot in the pits", "tw": 640, "th": 427}, {"alt": "The 6220 robot on the field next to another team's robot", "tw": 640, "th": 427}, {"alt": "Team members in the pit under The Golden Griffins banner", "tw": 640, "th": 427}, {"alt": "Robots on the field during a match", "tw": 640, "th": 427}, {"alt": "Students wheeling the robot across the courtyard", "tw": 640, "th": 427}]}, {"slug": "socal-showdown-2025", "name": "SoCal Showdown", "season": "2025", "game": "REEFSCAPE offseason", "tag": null, "photos": [{"alt": "Team photo on the grass with the robot cart", "tw": 640, "th": 426}, {"alt": "Students working on the robot in the pits", "tw": 640, "th": 426}, {"alt": "A team member on the field during setup", "tw": 426, "th": 640}, {"alt": "Team members in the pit under The Golden Griffins banner", "tw": 640, "th": 426}, {"alt": "Students working on the robot together", "tw": 426, "th": 640}, {"alt": "The whole team outside with The Golden Griffins banner", "tw": 640, "th": 480}, {"alt": "A team member setting the robot on the field", "tw": 426, "th": 640}, {"alt": "A team member lifting the robot at the field", "tw": 426, "th": 640}, {"alt": "A team member next to the robot at the field edge", "tw": 426, "th": 640}, {"alt": "The robot on the field during a match", "tw": 640, "th": 426}, {"alt": "Team members in 6220 shirts in the crowd", "tw": 640, "th": 426}]}, {"slug": "beach-blitz-2024", "name": "Beach Blitz", "season": "2024", "game": "CRESCENDO offseason", "tag": null, "photos": [{"alt": "Team members at the outreach table with The Golden Griffins sign", "tw": 640, "th": 480}, {"alt": "Team photo outdoors with the robot cart", "tw": 640, "th": 480}, {"alt": "Team members cheering in the stands with a 6220 sign", "tw": 640, "th": 480}, {"alt": "Drive team members at the driver station", "tw": 480, "th": 640}, {"alt": "Team members on the field after a match", "tw": 480, "th": 640}, {"alt": "Team members bringing the robot onto the field", "tw": 640, "th": 482}, {"alt": "The robot on the field behind the glass", "tw": 480, "th": 640}, {"alt": "The robot on the field during a match", "tw": 480, "th": 640}, {"alt": "Students working on the robot in the pits", "tw": 480, "th": 640}, {"alt": "Students fixing the robot at the pit table", "tw": 480, "th": 640}, {"alt": "Team members outside between matches", "tw": 480, "th": 640}, {"alt": "The drive team at the driver station with the 6220 display", "tw": 640, "th": 357}]}, {"slug": "oc-regional-2024", "name": "Orange County Regional", "season": "2024", "game": "CRESCENDO", "tag": null, "photos": [{"alt": "Team photo with the robot outside the venue", "tw": 640, "th": 480}, {"alt": "Close-up of the robot's shooter", "tw": 480, "th": 640}, {"alt": "Team members in the pit under The Golden Griffins banner", "tw": 640, "th": 480}]}, {"slug": "offseason-2023", "name": "FRC Offseason", "season": "2023", "game": "CHARGED UP offseason", "tag": null, "photos": [{"alt": "A student wiring the robot's electronics", "tw": 640, "th": 482}, {"alt": "Team members with the robot in the pits", "tw": 481, "th": 640}, {"alt": "A student working on the robot's frame", "tw": 481, "th": 640}, {"alt": "Drive team members watching a match", "tw": 640, "th": 482}, {"alt": "The drive team at the driver station", "tw": 481, "th": 640}, {"alt": "The robot on the field during a match", "tw": 640, "th": 482}, {"alt": "The arena seen from the stands", "tw": 640, "th": 482}, {"alt": "Close-up of the robot with its 6220 bumpers", "tw": 640, "th": 482}, {"alt": "A student working on the robot in the pits", "tw": 481, "th": 640}]}, {"slug": "oc-regional-2023", "name": "Orange County Regional", "season": "2023", "game": "CHARGED UP", "tag": "Finalist", "photos": [{"alt": "Team photo with the robot in front of Los Alamitos High School", "tw": 640, "th": 480}, {"alt": "Team members with the robot on its cart", "tw": 480, "th": 640}, {"alt": "Students working on the robot in the pits", "tw": 640, "th": 480}, {"alt": "Students working on the robot, seen from above", "tw": 480, "th": 640}, {"alt": "The robot on the field during a match", "tw": 480, "th": 640}, {"alt": "Close-up of the robot with its 6220 bumpers", "tw": 480, "th": 640}, {"alt": "Team members at a robot demo table", "tw": 640, "th": 480}, {"alt": "A student checking the robot in the pits", "tw": 480, "th": 640}, {"alt": "Team members walking through the pits", "tw": 480, "th": 640}]}, {"slug": "beach-blitz-2022", "name": "Beach Blitz", "season": "2022", "game": "RAPID REACT offseason", "tag": "Against All Odds", "photos": [{"alt": "Team photo outdoors with the robot", "tw": 640, "th": 480}, {"alt": "Mentors and students working on the robot", "tw": 640, "th": 427}, {"alt": "Students working on the robot in the pits", "tw": 640, "th": 427}, {"alt": "A student using the drill press", "tw": 640, "th": 427}, {"alt": "The robot on the field during a match", "tw": 640, "th": 427}, {"alt": "Team members cheering in the stands", "tw": 640, "th": 427}, {"alt": "The robot on the field", "tw": 640, "th": 427}, {"alt": "Team members gathered in the pits", "tw": 640, "th": 427}, {"alt": "The team celebrating together after the event", "tw": 640, "th": 427}]}, {"slug": "workshop-2021-22", "name": "Around the Workshop", "season": "2021–22", "game": "Build season", "tag": null, "photos": [{"alt": "Students working at tables outside the workshop", "tw": 480, "th": 640}, {"alt": "Team members working on campus", "tw": 640, "th": 480}, {"alt": "The robot testing on the blacktop outside the workshop", "tw": 640, "th": 360}, {"alt": "Students working on the robot", "tw": 426, "th": 640}, {"alt": "Close-up of the robot's electronics", "tw": 480, "th": 640}, {"alt": "The robot next to a wooden test structure", "tw": 640, "th": 480}, {"alt": "The robot from the front, outside the workshop", "tw": 640, "th": 480}, {"alt": "Students working at outdoor tables", "tw": 640, "th": 480}, {"alt": "The robot's intake and climber outside the workshop", "tw": 640, "th": 480}]}, {"slug": "oc-regional-2022", "name": "Orange County Regional", "season": "2022", "game": "RAPID REACT", "tag": null, "photos": [{"alt": "Team members in masks with the robot", "tw": 640, "th": 480}, {"alt": "The pits at the Orange County Regional", "tw": 640, "th": 480}, {"alt": "Students working on the robot in the pits", "tw": 480, "th": 640}, {"alt": "Team members walking through the pits", "tw": 480, "th": 640}, {"alt": "Team photo with the robot in front of Los Alamitos High School", "tw": 640, "th": 480}, {"alt": "The robot in front of Los Alamitos High School", "tw": 640, "th": 360}, {"alt": "Team members in masks posing in the pits", "tw": 640, "th": 480}, {"alt": "Team members with the robot near the field", "tw": 480, "th": 640}, {"alt": "The arena during a match", "tw": 640, "th": 480}]}, {"slug": "oc-regional-2019", "name": "Orange County Regional", "season": "2019", "game": "DESTINATION: DEEP SPACE", "tag": null, "photos": [{"alt": "Students working on laptops in the workshop", "tw": 640, "th": 480}, {"alt": "Students building the robot's elevator", "tw": 640, "th": 480}, {"alt": "CAD render of the 2019 robot", "tw": 640, "th": 640}, {"alt": "Students working on the robot in the pits", "tw": 640, "th": 360}, {"alt": "The robot with its 6220 bumpers", "tw": 426, "th": 640}, {"alt": "Students testing the robot in the workshop", "tw": 640, "th": 311}]}, {"slug": "power-up-2018", "name": "Power Up Season", "season": "2018", "game": "POWER UP", "tag": null, "photos": [{"alt": "Team photo in the school parking lot", "tw": 640, "th": 427}, {"alt": "Team members with the robot in the pits", "tw": 640, "th": 427}, {"alt": "Close-up of the robot holding a power cube", "tw": 640, "th": 427}, {"alt": "Students with the robot on the field", "tw": 427, "th": 640}, {"alt": "A student working on the robot in the pits", "tw": 427, "th": 640}]}, {"slug": "steamworks-2017", "name": "STEAMworks Season", "season": "2017", "game": "STEAMWORKS", "tag": null, "photos": [{"alt": "The robot in a test enclosure full of fuel balls", "tw": 640, "th": 480}, {"alt": "A student with the robot on the field", "tw": 427, "th": 640}, {"alt": "A student wiring the robot", "tw": 640, "th": 427}]}, {"slug": "stronghold-2016", "name": "Stronghold Season", "season": "2016", "game": "STRONGHOLD", "tag": "Regional Winner · Worlds", "photos": [{"alt": "Team members holding the FIRST Robotics Competition Winner banner", "tw": 640, "th": 639}, {"alt": "The 2016 robot", "tw": 480, "th": 640}, {"alt": "Teams gathered on the field at the World Championship", "tw": 640, "th": 424}]}];
  var galGrid=document.getElementById('gal-grid');
  if(galGrid){
  var galAlbum=document.getElementById('gal-album'),albumList=document.getElementById('album-photos');
  var pad=function(n){return (n<10?'0':'')+n};
  var galSrc=function(a,i,thumb){return (window.MEDIA_BASE||'')+'/gal/'+a.slug+'/'+pad(i+1)+(thumb?'-t':'')+'.webp'};
  var chips=[].slice.call(document.querySelectorAll('.chip')),cards=[].slice.call(document.querySelectorAll('#albums>li')),galCount=document.getElementById('gal-count');
  var filterYear=function(y){var n=0;chips.forEach(function(c){c.setAttribute('aria-pressed',String(c.dataset.year===y))});
    cards.forEach(function(li){var on=y==='all'||li.dataset.year===y;li.hidden=!on;if(on)n++});
    galCount.textContent=n+(n===1?' album':' albums')+(y==='all'?'':' from '+y)};
  chips.forEach(function(c){c.addEventListener('click',function(){filterYear(c.dataset.year)})});
  filterYear('all');
  var curAlbum=null,lbI=0,lbOpener=null;
  var lb=document.getElementById('lb'),lbImg=document.getElementById('lb-img'),lbCap=document.getElementById('lb-cap'),lbN=document.getElementById('lb-n');
  var renderGallery=function(slug){
    var a=null;GAL.forEach(function(x){if(x.slug===slug)a=x});
    if(!a){galAlbum.hidden=true;galGrid.hidden=false;curAlbum=null;return false}
    curAlbum=a;galGrid.hidden=true;galAlbum.hidden=false;
    document.querySelector('#album-title .wt').textContent=a.name+' '+a.season;
    document.getElementById('album-meta').textContent=[a.game,a.photos.length+' photos',a.tag].filter(Boolean).join(' · ');
    albumList.innerHTML='';
    a.photos.forEach(function(p,i){var li=document.createElement('li'),b=document.createElement('button'),im=document.createElement('img');
      b.type='button';b.setAttribute('aria-label','Open photo '+(i+1)+': '+p.alt);
      im.src=galSrc(a,i,true);im.alt=p.alt;im.loading='lazy';im.width=p.tw;im.height=p.th;
      b.appendChild(im);li.appendChild(b);albumList.appendChild(li);
      b.addEventListener('click',function(){openLb(i,b)})});
    return true};
  var showLb=function(i){var a=curAlbum,p=a.photos[i];lbI=i;lbImg.src=galSrc(a,i,false);lbImg.alt=p.alt;lbCap.textContent=p.alt;lbN.textContent=(i+1)+' / '+a.photos.length;
    var nx=new Image();nx.src=galSrc(a,(i+1)%a.photos.length,false)};
  var openLb=function(i,opener){lbOpener=opener;showLb(i);lb.hidden=false;root.classList.add('lb-open');document.getElementById('lb-x').focus()};
  var closeLb=function(){lb.hidden=true;root.classList.remove('lb-open');if(lbOpener)lbOpener.focus()};
  var step=function(d){var n=curAlbum.photos.length;showLb((lbI+d+n)%n)};
  document.getElementById('lb-x').addEventListener('click',closeLb);
  document.getElementById('lb-prev').addEventListener('click',function(){step(-1)});
  document.getElementById('lb-next').addEventListener('click',function(){step(1)});
  lb.addEventListener('click',function(e){if(e.target===lb||e.target.classList.contains('lb-fig'))closeLb()});
  document.addEventListener('keydown',function(e){if(lb.hidden)return;
    if(e.key==='Escape'){e.stopImmediatePropagation();closeLb()}else if(e.key==='ArrowRight')step(1);else if(e.key==='ArrowLeft')step(-1);
    else if(e.key==='Tab'){var f=[].slice.call(lb.querySelectorAll('button')),k=f.indexOf(document.activeElement);e.preventDefault();f[(k+(e.shiftKey?-1:1)+f.length)%f.length].focus()}},true);
  var sx=null;lb.addEventListener('pointerdown',function(e){sx=e.clientX});
  lb.addEventListener('pointerup',function(e){if(sx===null)return;var dx=e.clientX-sx;sx=null;if(Math.abs(dx)>50)step(dx<0?1:-1)});
  var showAlbum=function(first){var slug=decodeURIComponent(location.hash.slice(1))||null;if(!lb.hidden)closeLb();
    var opened=renderGallery(slug);
    if(opened||!first){var top=document.getElementById('gal-top').getBoundingClientRect().top+scrollY-80;window.scrollTo({top:Math.max(0,top),behavior:'instant'})}};
  addEventListener('hashchange',function(){showAlbum(false)});
  showAlbum(true);
  }

  /* ---- Copy buttons ---- */
  document.querySelectorAll('.copy-btn[data-copy]').forEach(function(cb){cb.addEventListener('click',function(){
    var code=cb.parentNode.querySelector('code');
    var sel=function(){var r=document.createRange();r.selectNodeContents(code);var s=getSelection();s.removeAllRanges();s.addRange(r);cb.textContent='SELECTED'};
    try{navigator.clipboard.writeText(cb.dataset.copy).then(function(){cb.textContent='COPIED';setTimeout(function(){cb.textContent='COPY'},1500)},sel)}catch(e){sel()}})});

  /* ---- Interest form (preview: no backend yet) ---- */
  var applyForm=document.getElementById('apply');
  if(applyForm)applyForm.addEventListener('submit',function(e){e.preventDefault();
    var n=document.getElementById('f-name'),m=document.getElementById('f-email'),ok=true;
    var nv=n.value.trim(),good=/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.value.trim());
    document.getElementById('f-name-err').hidden=!!nv;document.getElementById('f-email-err').hidden=good;
    n.toggleAttribute('aria-invalid',!nv);m.toggleAttribute('aria-invalid',!good);
    if(!nv||!good){(nv?m:n).focus();return}
    var r=document.getElementById('form-ok');r.textContent='Thanks, '+nv.split(' ')[0]+'! This is a design preview, so nothing was sent yet. Your web team will connect this form.';r.hidden=false});
})();

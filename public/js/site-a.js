/* Page-change loader. G6220Loader.run(swap): cover the page, spin the logo
   clockwise with speed trails, swap the page underneath, then fly the logo
   into the header while a gold angled wipe reveals the new page. */
(function(){
  var NS='http://www.w3.org/2000/svg',root=document.documentElement;
  var el=document.getElementById('pgl'),fly=document.getElementById('pgl-fly'),edge=document.getElementById('pgl-edge');
  var dotsG=document.getElementById('pgl-dots'),arcsG=document.getElementById('pgl-arcs'),ghostG=document.getElementById('pgl-ghosts');
  var label=document.getElementById('pgl-label'),ldots=label.querySelectorAll('i'),status=document.getElementById('pgl-status');
  var clamp=function(x,a,b){return Math.max(a,Math.min(b,x))},lin=function(t,a,b){return clamp((t-a)/(b-a),0,1)};
  var io=function(x){return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2};
  var dio=function(x){return x<.5?12*x*x:12*(1-x)*(1-x)}; /* derivative of io, peak 3 */
  var bez=function(x1,y1,x2,y2){return function(x){if(x<=0)return 0;if(x>=1)return 1;var lo=0,hi=1,t=.5;
    for(var i=0;i<30;i++){t=(lo+hi)/2;var cx=3*(1-t)*(1-t)*t*x1+3*(1-t)*t*t*x2+t*t*t;if(cx<x)lo=t;else hi=t}
    return 3*(1-t)*(1-t)*t*y1+3*(1-t)*t*t*y2+t*t*t}};
  var ez=bez(.22,1,.36,1);
  var mk=function(tag,attrs,parent){var n=document.createElementNS(NS,tag);for(var k in attrs)n.setAttribute(k,attrs[k]);parent.appendChild(n);return n};

  /* Logo + 3 afterimages (stage units: logo radius 75) */
  var VB=document.getElementById('griffin').getAttribute('viewBox');
  var logos=[];for(var g=3;g>=0;g--){var gg=mk('g',{},ghostG),s=mk('svg',{x:-75,y:-75,width:150,height:150,viewBox:VB,overflow:'visible'},gg);
    mk('use',{href:'#griffin'},s);logos[g]=gg}
  /* Three comet arcs around the emblem: head + two thinner tail pieces */
  var R=104,C=2*Math.PI*R,arcs=[];
  for(var a=0;a<3;a++){var parts=[];[[4,1],[2.4,.7],[1.2,.45]].forEach(function(p){parts.push(mk('circle',{r:R,cx:0,cy:0,fill:'none',stroke:'#ffa300','stroke-width':p[0],'stroke-linecap':'round',opacity:p[1]},arcsG))});arcs.push(parts)}
  /* Outer ring of 12 dots that stretch into streaks at speed */
  var R2=138,dots=[];for(var d=0;d<12;d++)dots.push(mk('line',{stroke:'#ffa300','stroke-width':3,'stroke-linecap':'round'},dotsG));

  /* One cycle, 1.15 s: wind-up (0.14) -> two clockwise turns (0.70) -> springy settle (0.31).
     The emblem itself distorts with speed: it squashes on the wind-up, shrinks, flattens and
     leans into the turn at top speed, then jiggles back to round when it stops. */
  var CYCLE=1.15,A=.14,B=.70;
  var spinState=function(t){
    var c=Math.min(t,CYCLE),ang,v=0,sx=1,sy=1,sk=0,sc=1;
    if(c<A){var e=io(c/A);ang=-16*e;sx=1+.07*e;sy=1-.09*e}
    else if(c<A+B){var k=(c-A)/B,p=io(k),rel=1-io(Math.min(k/.25,1));
      ang=-16+746*p;v=dio(k)/3;
      sx=1+.07*rel+.16*v;sy=1-.09*rel-.22*v;sk=-14*v;sc=1-.12*v}
    else{var s=(c-A-B)/(CYCLE-A-B),d=Math.exp(-4.5*s);
      ang=720+10*Math.exp(-5*s)*Math.cos(3*Math.PI*s)*(1-s);
      sy=1+.08*d*Math.sin(2.6*Math.PI*s)*(1-s);sx=1-.7*(sy-1);sc=1+.05*d*Math.sin(Math.PI*Math.min(s*2,1))}
    return {ang:ang,v:v,sx:sx*sc,sy:sy*sc,sk:sk,c:c}};
  var dist=function(st,a,css){return css?'scale('+st.sx+','+st.sy+') skewX('+st.sk+'deg) rotate('+a+'deg)':'scale('+st.sx+' '+st.sy+') skewX('+st.sk+') rotate('+a+')'};
  var drawSpin=function(st,o){ /* o: overrides for the hand-off */
    o=o||{};var ang=st.ang,v=st.v;
    /* afterimages trail behind the logo, collapse when it slows */
    var dd=st.sx==null?{sx:1,sy:1,sk:0}:st;
    logos[0].setAttribute('transform',dist(dd,ang));
    for(var g=1;g<4;g++){logos[g].setAttribute('transform',dist(dd,ang-g*16*v));logos[g].style.opacity=[0,.34,.18,.08][g]*v*(o.ghost==null?1:o.ghost)}
    logos[0].style.opacity=o.logo==null?1:o.logo;
    /* comet arcs: lead the logo (1.5x, seamless per cycle), grow from 16 to 110 deg with speed */
    var len=(o.len==null?16+94*v:o.len),rr=o.r||R,cc=2*Math.PI*rr,base=ang*1.5;
    arcs.forEach(function(parts,i){var head=base+i*120;
      parts.forEach(function(c,j){var seg=len*[.42,.33,.25][j],start=head-len*[0,.42,.75][j]-seg; /* tail sits behind the head */
        c.setAttribute('r',rr);c.setAttribute('stroke-dasharray',(cc*seg/360).toFixed(2)+' '+cc.toFixed(2));
        c.setAttribute('transform','rotate('+(start-90)+')');c.style.opacity=(o.arc==null?1:o.arc)*[1,.7,.45][j]})});
    /* dots -> streaks: tangential length 0 to 22 px with speed */
    var rot=ang*.5;dots.forEach(function(ln,i){var th=(rot+i*30)*Math.PI/180,L=(0.5+22*v)/R2;
      ln.setAttribute('x1',(Math.cos(th-L)*R2-0).toFixed(2));ln.setAttribute('y1',(Math.sin(th-L)*R2).toFixed(2));
      ln.setAttribute('x2',(Math.cos(th)*R2).toFixed(2));ln.setAttribute('y2',(Math.sin(th)*R2).toFixed(2));
      ln.style.opacity=(o.dots==null?1:o.dots)*(.35+.45*v)});
  };
  /* load and decode the split-spin video up front so it never stalls */
  var vidEl=document.getElementById('pgl-vid');
  try{vidEl.load()}catch(e){}
  var easeIO=function(x){x=clamp(x,0,1);return x*x*x*(x*(x*6-15)+10)};   /* smooth start and stop */
  window.G6220Loader={busy:false,run:function(swap){
    var self=this;if(self.busy){self.queued=swap;return}
    self.busy=true;self.queued=null;
    var main=document.getElementById('main'),t0=performance.now(),swapped=false,ready=false,phase='in',tSpin=0,tOut=0,raf;
    var vid=vidEl,videoOK=vid.readyState>=2&&!vid.error;
    var menu=[].slice.call(document.querySelectorAll('.wordmark,.menu>li,.menu-btn'));
    var stopScroll=function(e){e.preventDefault()};
    addEventListener('wheel',stopScroll,{passive:false});addEventListener('touchmove',stopScroll,{passive:false});
    root.classList.add('mh-logo');el.classList.add('on');el.style.clipPath='none';el.style.opacity=0;edge.style.display='none';
    fly.style.display='block';fly.style.opacity=0;status.textContent='Loading page';
    [fly,el,edge].forEach(function(n){n.style.willChange='transform,opacity'});if(main)main.style.willChange='transform';
    var big=Math.min(170,innerWidth*0.36);         /* logo size on screen */
    var vsz=big*1080/475;                          /* the logo fills 475 of the video's 1080 px */
    vid.style.width=vid.style.height=vsz+'px';vid.style.visibility='visible';vid.style.opacity=0;
    try{vid.pause();vid.currentTime=0}catch(e){}
    fly.style.width=fly.style.height=big+'px';fly.style.transformOrigin='50% 50%';
    /* the logo only moves with transform: translate + scale + rotate */
    /* measure where the drawn logo actually sits inside its box, so we can line it up by the artwork itself */
    fly.style.transform='none';
    var rb=fly.getBoundingClientRect(),ra=fly.querySelector('use').getBoundingClientRect();
    var fracW=(ra.width/rb.width)||1,offX=((ra.left+ra.width/2)-(rb.left+rb.width/2))/rb.width,offY=((ra.top+ra.height/2)-(rb.top+rb.height/2))/rb.height;
    /* setFly(art centre x, art centre y, art width, rotation, opacity) */
    var setFly=function(cx,cy,artW,rot,op){var S=artW/fracW,bx=cx-offX*S,by=cy-offY*S;
      fly.style.transform='translate('+(bx-big/2)+'px,'+(by-big/2)+'px) scale('+(S/big)+') rotate('+rot+'deg)';fly.style.opacity=op};
    var whenReady=function(){ /* new page laid out, fonts ready, first image decoded */
      var img=document.querySelector('.page.current img');var ps=[];
      try{if(document.fonts&&document.fonts.ready)ps.push(document.fonts.ready)}catch(e){}
      try{if(img&&img.decode)ps.push(img.decode().catch(function(){}))}catch(e){}
      Promise.all(ps).then(function(){requestAnimationFrame(function(){ready=true})},function(){ready=true});
    };
    var START=0.95;                                /* video time where the landing has settled to under 1 px */
    var tHold=0;
    var frame=function(now){
      var t=(now-t0)/1000,W=innerWidth,H=innerHeight,cx=W/2,cy=H/2;
      if(phase==='in'){                            /* 0.22 s: cover fades in, logo appears (video frame 0) */
        var p=ez(lin(t,0,.22));el.style.opacity=p;label.style.opacity=p;
        if(videoOK){vid.style.opacity=p}else{setFly(cx,cy,big*(.92+.08*p),0,p)}
        if(t>=.22){phase='spin';tSpin=t;if(videoOK){var pp;try{pp=vid.play()}catch(e){videoOK=false}if(pp&&pp.catch)pp.catch(function(){videoOK=false;vid.style.opacity=0})}}
      }else if(phase==='spin'){
        var ts_=t-tSpin;
        if(!swapped&&ts_>.05){swapped=true;try{swap()}catch(e){}scrollTo(0,0);
          if(main)main.style.transform='scale(1.02)';
          menu.forEach(function(m){m.style.opacity=0});whenReady()}
        var n=Math.floor(ts_/.25)%4;for(var i=0;i<3;i++)ldots[i].style.opacity=i<n?1:0;
        var done;
        if(videoOK){done=vid.ended||vid.currentTime>=START||ts_>=1.2}
        else{setFly(cx,cy,big,360*easeIO(ts_/.85),1);done=ts_>=.85}   /* fallback: plain spin */
        if(done){
          if(!ready&&!tHold)tHold=t;
          if(ready||t-tHold>=.15){                /* hold the logo still (max 150 ms) until the page is ready */
            phase='out';tOut=t;
            setFly(cx,cy,big,0,1);                 /* vector logo exactly on top of the video's logo */
          }
        }
      }else{                                       /* morph into the header: one shared 0.8 s timeline */
        var sp=self.queued?2.6:1,u=(t-tOut)*sp;   /* a click during the loader finishes it in ~0.3 s */
        if(videoOK)vid.style.opacity=1-lin(u,0,.06);   /* crossfade the video out under the vector logo */
        var target=document.querySelector('.center-logo svg'),r=target.getBoundingClientRect();
        var tx=r.left+r.width/2+offX*r.width,ty=r.top+r.height/2+offY*r.height,tsz=(r.width||58)*fracW;   /* header logo's artwork */
        label.style.opacity=1-ez(lin(u,0,.12));
        /* glide: one arc, starts from zero speed, settles horizontally into the slot */
        var k=easeIO(lin(u,.05,.65));
        var c1x=cx+(tx-cx)*.35,c1y=ty;             /* control point level with the slot = horizontal arrival */
        var px=(1-k)*(1-k)*cx+2*(1-k)*k*c1x+k*k*tx,py=(1-k)*(1-k)*cy+2*(1-k)*k*c1y+k*k*ty;
        var ks=easeIO(lin(u,.05,.52));             /* shrinks from a gentle start, done just before arrival */
        var size=big+(tsz-big)*ks;
        var q=lin(u,.62,.8);size*=1+.02*Math.sin(Math.PI*q)*(1-q);   /* tiny click into place (<2%) */
        setFly(px,py,size,0,1);
        /* wipe: left to right, eased, passes the logo slot about when the logo arrives */
        var w=easeIO(lin(u,.28,.78)),lean=Math.tan(5*Math.PI/180)*H/2,ex=-lean-40+(W+2*lean+80)*w;
        if(u>=.28){el.style.clipPath='polygon('+(ex+lean)+'px 0,'+W+'px 0,'+W+'px '+H+'px,'+(ex-lean)+'px '+H+'px)';
          edge.style.display='block';edge.style.transform='translateX('+(ex-1.5)+'px) rotate(5deg)';edge.style.left='0px';edge.style.opacity=1-lin(w,.9,1)}
        /* camera settle toward the logo slot */
        if(main){var mr=main.getBoundingClientRect();main.style.transformOrigin=(tx-mr.left)+'px '+(ty-mr.top)+'px';
          main.style.transform='scale('+(1.02-.02*ez(lin(u,.2,.75)))+')'}
        /* menu fades in left to right */
        menu.forEach(function(m,i){var o=ez(lin(u,.45+i*.03,.62+i*.03));m.style.opacity=o;m.style.transform='translateY('+((1-o)*5)+'px)'});
        if(u>=.8){cancelAnimationFrame(raf);finish();return}
      }
      raf=requestAnimationFrame(frame);
    };
    var finish=function(){
      root.classList.remove('mh-logo');            /* real header logo appears exactly where the vector logo is */
      requestAnimationFrame(function(){
        el.classList.remove('on');el.style.clipPath='';fly.style.display='none';edge.style.display='none';
        vid.style.visibility='hidden';try{vid.pause();vid.currentTime=0}catch(e){}
        if(main){main.style.transform='';main.style.transformOrigin='';main.style.willChange=''}
        [fly,el,edge].forEach(function(n){n.style.willChange=''});
        menu.forEach(function(m){m.style.opacity='';m.style.transform=''});
        removeEventListener('wheel',stopScroll);removeEventListener('touchmove',stopScroll);
        status.textContent='';self.busy=false;
        if(self.queued){var q=self.queued;self.queued=null;q()}
      });
    };
    raf=requestAnimationFrame(frame);
  }};
})();

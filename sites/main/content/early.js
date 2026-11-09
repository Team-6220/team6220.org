document.documentElement.classList.add('js');
/* Intro: home page only (MainLayout sets G6220_INTRO there), first visit in each browser session. */
(function(){if(!window.G6220_INTRO)return;var seen=false;try{seen=sessionStorage.getItem('g6220-intro')==='1'}catch(e){}
if(!seen){var c=document.documentElement.classList;c.add('intro-on');if(matchMedia('(prefers-reduced-motion: reduce)').matches)c.add('intro-rm')}})();
/* Page-change loader: the previous page covered the screen just before navigating here (site-a.js).
   Keep the cover up from the first paint so site-a.js can finish the animation on this page. */
(function(){var t=0;try{t=+sessionStorage.getItem('g6220-pgl')||0;sessionStorage.removeItem('g6220-pgl')}catch(e){}
if(t&&Date.now()-t<8000&&!document.documentElement.classList.contains('intro-on'))document.documentElement.classList.add('pgl-arrive','mh-logo')})();

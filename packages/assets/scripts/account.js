/* Who is signed in, for page chrome (the sidebar's account row and the main site's Log In button).
   Published at /assets/shared/scripts/account.js.

   packages/data saves the member's name and picture in the browser when it loads the member
   (team6220.member) and removes them at sign-out. Signed in means the wixSession cookie (Wix's built-in login)
   holds member tokens. This only decides what to SHOW; it protects nothing.
   Use: team6220Account.member() returns { name, photoUrl } or null; team6220Account.avatar(member)
   returns the round picture (or the first letter of the name). Styles: .t-avatar in app-sidebar.css
   and the main site's site.css. */
(function () {
  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (e) {
      return null; // storage blocked or not JSON
    }
  }

  function sessionTokens() {
    var row = document.cookie.split("; ").filter(function (r) { return r.indexOf("wixSession=") === 0; })[0];
    if (!row) return null;
    try {
      return JSON.parse(decodeURIComponent(row.slice("wixSession=".length))).tokens || null;
    } catch (e) {
      return null;
    }
  }

  /* Which apps a person can open, to decide which to SHOW (the rail, the top bar, the main site's Apps menu). Each
     app checks for itself; this protects nothing. level: "visitor" (signed out, waiting for approval, alumni),
     "guest", "member" (any team member, mentor, booster, lead or supervisor) or "unknown" (signed in, not looked up
     yet: the apps' own pages save it as soon as they know). */
  function accessOf(member) {
    if (!member) return { level: "visitor", webAdmin: false };
    var hint = read("team6220.member") || {};
    var level = hint.access === "member" || hint.access === "guest" || hint.access === "visitor" ? hint.access : "unknown";
    return { level: level, webAdmin: hint.webAdmin === true };
  }

  window.team6220Account = {
    /** { level, webAdmin } */
    access: function () {
      return accessOf(this.member());
    },
    /** True when this person can open the app (an entry from apps.json: access, guests, publicView, status). */
    canOpen: function (app) {
      var who = this.access();
      if (app.access === "web-admin") return who.webAdmin;
      if (who.level === "member" || who.level === "unknown") return true;
      if (app.status !== "live") return false;
      return app.access === "public" || app.publicView === true || (who.level === "guest" && app.guests === true);
    },
    member: function () {
      var tokens = sessionTokens();
      var member = read("team6220.member");
      var signedIn = tokens && tokens.refreshToken && tokens.refreshToken.role === "member";
      return signedIn && member && typeof member.name === "string" ? member : null;
    },
    avatar: function (member) {
      var photo = typeof member.photoUrl === "string" && member.photoUrl.indexOf("https://") === 0 ? member.photoUrl : "";
      var node = document.createElement(photo ? "img" : "span");
      node.className = "t-avatar";
      if (photo) {
        node.src = photo;
        node.alt = "";
        node.referrerPolicy = "no-referrer";
      } else {
        node.textContent = member.name.charAt(0).toUpperCase();
        node.setAttribute("aria-hidden", "true");
      }
      return node;
    },
  };
})();

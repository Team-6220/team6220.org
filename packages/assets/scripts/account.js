/* Who is signed in, for page chrome (the sidebar's account row and the main site's Log In button).
   Published at /assets/shared/scripts/account.js.

   packages/data saves the member's name and picture in the browser when it loads the member
   (team6220.member) and removes them at sign-out. This only decides what to SHOW; it protects nothing.
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

  window.team6220Account = {
    member: function () {
      var tokens = read("team6220.wix.tokens");
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

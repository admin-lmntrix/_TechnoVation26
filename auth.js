/* ============================================================
   TECHNOVATION '26 · auth.js — Firebase Auth + Firestore
   Real accounts + shared cloud database (syncs across devices).
   Roles: rep / member / host. All methods are ASYNC (return Promises).
   Requires the firebase compat SDK <script> tags to load first.
   ============================================================ */
(function (global) {
  "use strict";

  var firebaseConfig = {
    apiKey: "AIzaSyBOJCaI1grqanCKi_xoSFTZCg3eW78Rgx8",
    authDomain: "tv26-f6874.firebaseapp.com",
    projectId: "tv26-f6874",
    storageBucket: "tv26-f6874.firebasestorage.app",
    messagingSenderId: "1006254428737",
    appId: "1:1006254428737:web:1763aede66905981b9acc0",
    measurementId: "G-C0M6VMHLHZ"
  };

  if (typeof firebase === "undefined") {
    console.error("[auth] Firebase SDK didn't load — check the firebase <script> tags / your connection.");
    return;
  }
  firebase.initializeApp(firebaseConfig);
  var auth = firebase.auth();
  var db = firebase.firestore();
  var FV = firebase.firestore.FieldValue;

  var HOST_CODE = "MPBF-HOST-2026";
  var EVENTS = ["Hindrance", "Breach", "Neuralysis", "Retrieval", "El Clasico", "Inference",
    "Outreach", "Robology", "End-to-End", "Wavered", "Blockade", "Grid-Lock", "B-Roll",
    "Socrates", "Advantage"];

  // Max participants per event, per school (from the brochure).
  // Outreach is "3-5" → max 5. B-Roll is "TBA" → placeholder 4 (change if needed).
  var EVENT_LIMITS = {
    "Hindrance": 3, "Breach": 2, "Neuralysis": 2, "Retrieval": 1, "El Clasico": 2, "Inference": 2,
    "Outreach": 5, "Robology": 3, "End-to-End": 3, "Wavered": 2, "Blockade": 1, "Grid-Lock": 2,
    "B-Roll": 1, "Socrates": 3, "Advantage": 2
  };

  function err(m) { return { ok: false, error: m }; }
  function norm(s) { return (s || "").trim(); }
  function lc(s) { return norm(s).toLowerCase(); }

  /* ---------- auth state ---------- */
  var _user = null, _profile = null, _readyResolve, _readyDone = false;
  var _ready = new Promise(function (res) { _readyResolve = res; });

  auth.onAuthStateChanged(function (u) {
    _user = u || null;
    function done() { renderNav(); if (!_readyDone) { _readyDone = true; _readyResolve(current()); } }
    if (u) {
      db.collection("users").doc(u.uid).get()
        .then(function (snap) { _profile = snap.exists ? snap.data() : null; done(); })
        .catch(function () { _profile = null; done(); });
    } else { _profile = null; done(); }
  });

  function current() {
    if (!_user) return null;
    if (!_profile) return { uid: _user.uid, email: _user.email || "", role: null, name: (_user.email || "").split("@")[0], schoolId: null, events: [] };
    return { uid: _user.uid, email: _user.email || "", role: _profile.role, name: _profile.name, schoolId: _profile.schoolId || null, events: (_profile.events || []).slice() };
  }

  /* ---------- schools ---------- */
  function ensureSchool(name) {
    var n = lc(name);
    return db.collection("schools").where("nameLower", "==", n).limit(1).get().then(function (q) {
      if (!q.empty) return q.docs[0].id;
      return db.collection("schools").add({ name: norm(name), nameLower: n, createdAt: FV.serverTimestamp() }).then(function (ref) { return ref.id; });
    });
  }
  function allSchools() {
    return db.collection("schools").get().then(function (q) {
      var list = q.docs.map(function (d) { return { id: d.id, name: (d.data().name || "") }; });
      list.sort(function (a, b) { return a.name.localeCompare(b.name); });
      return list;
    });
  }
  function getSchoolName(id) {
    if (!id) return Promise.resolve("");
    return db.collection("schools").doc(id).get().then(function (s) { return s.exists ? (s.data().name || "") : ""; });
  }

  /* ---------- sign up / login ---------- */
  function signUp(d) {
    var role = d.role, name = norm(d.name), email = norm(d.email), pass = d.password || "";
    if (!role) return Promise.resolve(err("Choose an account type."));
    if (!name) return Promise.resolve(err("Please enter your name."));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Promise.resolve(err("Enter a valid email address."));
    if (pass.length < 6) return Promise.resolve(err("Password must be at least 6 characters."));
    if (role === "host" && norm(d.hostCode) !== HOST_CODE) return Promise.resolve(err("That host access code isn't valid."));
    if ((role === "rep" || role === "member") && !norm(d.school)) return Promise.resolve(err("Enter your school's name."));
    if (role === "member" && (!d.events || !d.events.length)) return Promise.resolve(err("Select at least one event you're entering."));

    // create the auth account first (this signs them in so the next writes are allowed by the rules)
    return auth.createUserWithEmailAndPassword(email, pass).then(function (cred) {
      var uid = cred.user.uid;
      var schoolP = (role === "rep" || role === "member") ? ensureSchool(d.school) : Promise.resolve(null);
      return schoolP.then(function (schoolId) {
        var prof = {
          role: role, name: name, email: email, schoolId: schoolId,
          events: role === "member" ? d.events.slice() : [], createdAt: FV.serverTimestamp()
        };
        _profile = prof;
        return db.collection("users").doc(uid).set(prof).then(function () { return { ok: true }; });
      });
    }).catch(function (e) { return err(mapAuthError(e)); });
  }

  function login(email, password) {
    return auth.signInWithEmailAndPassword(norm(email), password || "")
      .then(function () { return { ok: true }; })
      .catch(function (e) { return err(mapAuthError(e)); });
  }
  function logout() { return auth.signOut(); }

  function mapAuthError(e) {
    var c = (e && e.code) || "";
    if (c.indexOf("email-already-in-use") > -1) return "An account with that email already exists. Try logging in.";
    if (c.indexOf("invalid-email") > -1) return "That email address looks invalid.";
    if (c.indexOf("weak-password") > -1) return "Password is too weak — use at least 6 characters.";
    if (c.indexOf("wrong-password") > -1 || c.indexOf("invalid-credential") > -1 || c.indexOf("invalid-login") > -1 || c.indexOf("user-not-found") > -1) return "Wrong email or password.";
    if (c.indexOf("too-many-requests") > -1) return "Too many attempts — please wait a moment and try again.";
    if (c.indexOf("network") > -1) return "Network error — check your connection.";
    if (c.indexOf("permission") > -1 || c.indexOf("insufficient") > -1) return "Permission denied — the database rules may need publishing.";
    return (e && e.message) || "Something went wrong. Please try again.";
  }

  /* ---------- roster ---------- */
  function team(schoolId) {
    var usersP = db.collection("users").where("schoolId", "==", schoolId).get();
    var rosterP = db.collection("roster").where("schoolId", "==", schoolId).get();
    return Promise.all([usersP, rosterP]).then(function (r) {
      var reps = [], members = [];
      r[0].docs.forEach(function (d) {
        var x = d.data();
        if (x.role === "rep") reps.push({ id: d.id, kind: "user", name: x.name, email: x.email || "", events: (x.events || []) });
        else if (x.role === "member") members.push({ id: d.id, kind: "user", name: x.name, email: x.email || "", events: (x.events || []) });
      });
      r[1].docs.forEach(function (d) { var x = d.data(); members.push({ id: d.id, kind: "roster", name: x.name, email: "", events: (x.events || []) }); });
      return { reps: reps, members: members };
    });
  }
  function hosts() {
    return db.collection("users").where("role", "==", "host").get().then(function (q) {
      return q.docs.map(function (d) { var x = d.data(); return { uid: d.id, name: x.name, email: x.email || "" }; });
    });
  }

  function addMember(name, events) {
    if (!_profile || _profile.role !== "rep") return Promise.resolve(err("Only representatives can add members."));
    name = norm(name);
    if (!name) return Promise.resolve(err("Enter the member's name."));
    if (!events || !events.length) return Promise.resolve(err("Pick at least one event for this member."));
    return db.collection("roster").add({ schoolId: _profile.schoolId, name: name, events: events.slice(), addedBy: _user.uid, createdAt: FV.serverTimestamp() })
      .then(function () { return { ok: true }; })
      .catch(function (e) { return err(mapAuthError(e)); });
  }
  function removeMember(m) {
    if (!_profile || (_profile.role !== "rep" && _profile.role !== "host")) return Promise.resolve(err("You don't have permission to remove members."));
    var p = (m.kind === "roster") ? db.collection("roster").doc(m.id).delete() : db.collection("users").doc(m.id).delete();
    return p.then(function () { return { ok: true }; }).catch(function (e) { return err(mapAuthError(e)); });
  }

  // rep (own school) or host (any school): overwrite which events a member is in
  function setMemberEvents(m, events) {
    if (!_profile || (_profile.role !== "rep" && _profile.role !== "host")) return Promise.resolve(err("You don't have permission to change events."));
    var coll = (m.kind === "roster") ? "roster" : "users";
    var clean = [];
    (events || []).forEach(function (e) { if (e && clean.indexOf(e) < 0) clean.push(e); });
    return db.collection(coll).doc(m.id).update({ events: clean })
      .then(function () { return { ok: true }; })
      .catch(function (e) { return err(mapAuthError(e)); });
  }

  // delete own account for real: reauthenticate with the password (Firebase needs a
  // recent login to delete a user), then remove the profile AND the Auth login so the
  // email is freed up for re-registration.
  function deleteAccount(password) {
    var u = auth.currentUser;
    if (!u) return Promise.resolve(err("You're not signed in."));
    if (!u.email) return Promise.resolve(err("This account can't be removed automatically — ask a host to delete it."));
    if (!password) return Promise.resolve(err("Enter your password to confirm."));
    var cred = firebase.auth.EmailAuthProvider.credential(u.email, password);
    return u.reauthenticateWithCredential(cred).then(function () {
      return db.collection("users").doc(u.uid).delete().then(function () {
        return u.delete().then(function () { return { ok: true }; });
      });
    }).catch(function (e) {
      var c = (e && e.code) || "";
      if (c.indexOf("wrong-password") > -1 || c.indexOf("invalid-credential") > -1 || c.indexOf("invalid-login") > -1 || c.indexOf("mismatch") > -1) return err("That password is incorrect.");
      return err(mapAuthError(e));
    });
  }

  // host-only: remove a whole school and everyone tied to it (reps, members, roster)
  function deleteSchool(schoolId) {
    if (!_profile || _profile.role !== "host") return Promise.resolve(err("Only host authorities can remove schools."));
    if (!schoolId) return Promise.resolve(err("No school selected."));
    var rosterP = db.collection("roster").where("schoolId", "==", schoolId).get();
    var usersP = db.collection("users").where("schoolId", "==", schoolId).get();
    return Promise.all([rosterP, usersP]).then(function (r) {
      var batch = db.batch();
      r[0].docs.forEach(function (d) { batch.delete(d.ref); });
      r[1].docs.forEach(function (d) { if ((d.data().role || "") !== "host") batch.delete(d.ref); });
      batch.delete(db.collection("schools").doc(schoolId));
      return batch.commit();
    }).then(function () { return { ok: true }; }).catch(function (e) { return err(mapAuthError(e)); });
  }

  function roleLabel(r) { return r === "rep" ? "Representative" : r === "host" ? "Host Authority" : "Member"; }

  /* ---------- nav login state ---------- */
  function renderNav() {
    var nav = document.querySelector(".nav-links");
    if (!nav) return;
    var me = current();
    var cta = nav.querySelector("[data-auth-cta]");
    var chip = nav.querySelector(".nav-user"); if (chip) chip.remove();
    if (me && _user) {
      if (cta) {
        cta.textContent = "Log Out";
        cta.setAttribute("href", "#");
        cta.onclick = function (e) { e.preventDefault(); logout().then(function () { location.href = "index.html"; }); };
      }
      var rl = me.role === "rep" ? "Rep" : me.role === "host" ? "Host" : me.role === "member" ? "Member" : "";
      var span = document.createElement("span");
      span.className = "nav-user";
      span.textContent = (me.name || "").split(/\s+/)[0] + (rl ? " · " + rl : "");
      span.style.cssText = "font-family:var(--tech);font-size:.64rem;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-300);align-self:center;opacity:.85";
      if (cta) nav.insertBefore(span, cta);
    } else if (cta) {
      cta.textContent = "Sign Up";
      cta.onclick = null;
      cta.setAttribute("href", "signup.html");
    }
  }

  global.Auth = {
    EVENTS: EVENTS, EVENT_LIMITS: EVENT_LIMITS, HOST_CODE: HOST_CODE,
    ready: function () { return _ready; },
    signUp: signUp, login: login, logout: logout, current: current,
    allSchools: allSchools, getSchoolName: getSchoolName, team: team, hosts: hosts,
    addMember: addMember, removeMember: removeMember, setMemberEvents: setMemberEvents,
    deleteAccount: deleteAccount, deleteSchool: deleteSchool, roleLabel: roleLabel
  };
})(window);

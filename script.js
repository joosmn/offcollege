function showLogin() {
  document.getElementById('loginBox').classList.remove('hidden');
}

function login() {
  const pwd = document.getElementById('adminPassword').value;
  if (pwd === "secret123") {
    window.location.href = "admin.html";
  } else {
    alert("Mot de passe incorrect !");
  }
}

function logout() {
  window.location.href = "index.html";
}

function goTo(page) {
  alert("Fonctionnalité en construction: " + page);
}
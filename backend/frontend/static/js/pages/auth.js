(function () {
  const ctx = window.RiskDesk;
  const {
    app, globalSearch, notificationOverlay, state, routeTitles, routePaths, pendingKeys, searchHistoryKey, palette,
    esc, currentRoute, readPendingValue, readPendingJson, pageHtml, componentHtml, navigate, initials, updateHeaderUser, showToast,
    loading, renderError, emptyHtml, chip, shortTime, dateTime, saveUserSubscriptions, setCurrentUser, uniqueValues,
    levelRank, projectByName, projectAnalyzeAttrs, renderRoute,
  } = ctx;

function renderLogin() {
    if (state.currentUser) return navigate("profile");
    app.innerHTML = pageHtml("login");
    document.getElementById("loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = document.getElementById("loginSubmit"); button.disabled = true; button.textContent = "Входим…";
      try {
        const result = await window.api.login({ username: document.getElementById("loginUsername").value.trim(), password: document.getElementById("loginPassword").value });
        setCurrentUser(result.user); state.analysisHistory = []; state.riskChanges = []; showToast("Вход выполнен"); navigate("profile");
      } catch (error) { document.getElementById("loginError").textContent = error.message; button.disabled = false; button.textContent = "Войти"; }
    });
  }

function renderRegister() {
    if (state.currentUser) return navigate("profile");
    app.innerHTML = pageHtml("register");
    document.getElementById("registerForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const password = document.getElementById("registerPassword").value; const errorBox = document.getElementById("registerError");
      if (password !== document.getElementById("registerConfirm").value) { errorBox.textContent = "Пароли не совпадают"; return; }
      const button = document.getElementById("registerSubmit"); button.disabled = true; button.textContent = "Создаём…";
      try {
        const result = await window.api.register({
          username: document.getElementById("registerUsername").value.trim(),
          email: document.getElementById("registerEmail").value.trim(),
          role: document.getElementById("registerRole").value.trim(),
          division: document.getElementById("registerDivision").value.trim(),
          password,
          passwordAgain: document.getElementById("registerConfirm").value,
          policyCheck: document.getElementById("registerPolicy").checked,
        });
        setCurrentUser(result.user); state.analysisHistory = []; state.riskChanges = []; showToast("Учётная запись создана"); navigate("profile");
      } catch (error) { errorBox.textContent = error.message; button.disabled = false; button.textContent = "Создать учётную запись"; }
    });
  }

  ctx.renderLogin = renderLogin;
  ctx.renderRegister = renderRegister;
  ctx.registerPage("login", renderLogin);
  ctx.registerPage("register", renderRegister);
})();

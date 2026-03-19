document.getElementById("login-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const data = await loginPost("/login", { username, password });
    if (data && data.token) {
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("username", username);
      window.location.href = "dashboard.html";
    } else {
      showToast("Invalid credentials", "error");
    }
  } catch (err) {
    showToast(err.message || "Login failed. Please try again.", "error");
  }
});

// Login-specific POST (separate from api.js postData to avoid shadowing)
async function loginPost(url, data) {
  const API_URL = `${window.location.protocol}//${window.location.hostname}:5000`;
  const response = await fetch(API_URL + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const err = new Error(body.error || `Error ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

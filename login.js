document.getElementById("login-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const data = await postData("/login", { username, password });

  if (data.token) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("role", data.role);
    localStorage.setItem("username", username);
    window.location.href = "dashboard.html";
  } else {
    showToast("Invalid credentials", "error");
  }
});

// ฟังก์ชันสำหรับ POST
async function postData(url = "", data = {}) {
  const API_URL = `${window.location.protocol}//${window.location.hostname}:4003`;
  const response = await fetch(API_URL + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return response.json();
}

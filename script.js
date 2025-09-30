// script.js (module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Firebase config (تأكد أنك تريد مشاركة هذه القيم علناً)
const firebaseConfig = {
  apiKey: "AIzaSyCNuKqEG4wQLVjPYdSnw284fW8A7epqRmA",
  authDomain: "popiram-cee4a.firebaseapp.com",
  projectId: "popiram-cee4a",
  storageBucket: "popiram-cee4a.appspot.com",
  messagingSenderId: "762606980339",
  appId: "1:762606980339:web:1c1ede281be55f48b43b86",
  measurementId: "G-QZC4073YKZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Only this UID allowed
const ALLOWED_UID = "S4WyLREq2Ob9QRE7NiROMn7qVYf1";

// Web Crypto helper: requires secure context (https or localhost)
async function deriveKey(password, salt) {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = encoder.encode(salt);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-CBC", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptData(data, password) {
  try {
    const salt = "fixed_salt_for_demo";
    const key = await deriveKey(password, salt);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    const iv = crypto.getRandomValues(new Uint8Array(16));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-CBC", iv },
      key,
      dataBuffer
    );

    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...result));
  } catch (error) {
    console.error("Encryption error:", error);
    throw error;
  }
}

async function decryptData(encryptedData, password) {
  try {
    const salt = "fixed_salt_for_demo";
    const key = await deriveKey(password, salt);
    const decoder = new TextDecoder();

    const encryptedBuffer = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    const iv = encryptedBuffer.slice(0, 16);
    const data = encryptedBuffer.slice(16);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv },
      key,
      data
    );

    return decoder.decode(decrypted);
  } catch (error) {
    console.error("Decryption error:", error);
    return null;
  }
}

// Login function
async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const msg = document.getElementById("msg");

  // Check for secure context
  if (location.protocol !== "https:" && location.hostname !== "localhost") {
    msg.style.color = "red";
    msg.textContent = "⚠️ This app needs to run on https or http://localhost for encryption and Firebase modules to work. Start a local server.";
    return;
  }

  try {
    // Attempt login (we use real email/password to Firebase auth)
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (user.uid !== ALLOWED_UID) {
      msg.style.color = "red";
      msg.textContent = "❌ Access Denied!";
      await signOut(auth);
      return;
    }

    // store session encryption key (here we use plain password as key for demo)
    sessionStorage.setItem('encryptionKey', password);

    document.getElementById("loginBox").style.display = "none";
    document.getElementById("dashboard").style.display = "block";
    document.getElementById("welcome").textContent = "✅ Welcome essafi!";

    await loadSites();
  } catch (error) {
    msg.style.color = "red";
    msg.textContent = "Error: " + (error?.message || error);
  }
}

// Logout
async function logout() {
  await signOut(auth);
  sessionStorage.removeItem('encryptionKey');
  document.getElementById("dashboard").style.display = "none";
  document.getElementById("loginBox").style.display = "block";
  document.getElementById("msg").textContent = "";
}

// Add site
async function addSite() {
  const siteName = document.getElementById("siteName").value.trim();
  const siteEmail = document.getElementById("siteEmail").value.trim();
  const sitePassword = document.getElementById("sitePassword").value;

  if (!siteName || !siteEmail) {
    alert("Please enter site name and email");
    return;
  }

  try {
    const encryptionKey = sessionStorage.getItem('encryptionKey') || "";
    const encryptedName = await encryptData(siteName, encryptionKey);
    const encryptedEmail = await encryptData(siteEmail, encryptionKey);
    const encryptedPassword = await encryptData(sitePassword || "", encryptionKey);

    await addDoc(collection(db, "sites"), {
      name: encryptedName,
      email: encryptedEmail,
      password: encryptedPassword,
      createdAt: new Date(),
      userId: ALLOWED_UID
    });

    document.getElementById("siteName").value = "";
    document.getElementById("siteEmail").value = "";
    document.getElementById("sitePassword").value = "";

    await loadSites();
    showToast("Site added successfully!");
  } catch (error) {
    console.error("Error adding site: ", error);
    showToast("Error adding site", true);
  }
}

// Load sites
async function loadSites() {
  const sitesList = document.getElementById("sitesList");
  sitesList.innerHTML = "<p>Loading data...</p>";

  try {
    const querySnapshot = await getDocs(collection(db, "sites"));
    const encryptionKey = sessionStorage.getItem('encryptionKey') || "";

    if (querySnapshot.empty) {
      sitesList.innerHTML = "<p>No sites registered yet</p>";
      return;
    }

    let html = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Site Name</th>
              <th>Email/Username</th>
              <th>Password</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data();
      const id = docSnap.id;

      let decryptedName = await decryptData(data.name, encryptionKey);
      let decryptedEmail = await decryptData(data.email, encryptionKey);
      let decryptedPassword = await decryptData(data.password, encryptionKey);

      if (!decryptedName) decryptedName = "❌ Decryption error";
      if (!decryptedEmail) decryptedEmail = "❌ Decryption error";
      if (!decryptedPassword) decryptedPassword = "❌ Decryption error";

      html += `
        <tr data-id="${id}">
          <td>${escapeHtml(decryptedName)}</td>
          <td><span class="email-field">${escapeHtml(decryptedEmail)}</span></td>
          <td>
            <span class="password-field">${'*'.repeat(decryptedPassword.length)}</span>
            <button class="btn-ghost btn-small toggle-btn">Show</button>
            <span class="actual-password hidden">${escapeHtml(decryptedPassword)}</span>
            <button class="btn-ghost btn-small copy-btn" data-password="${escapeHtml(decryptedPassword)}">Copy</button>
          </td>
          <td>
            <button class="btn-danger btn-small delete-btn">Delete</button>
          </td>
        </tr>
      `;
    }

    html += `</tbody></table></div>`;
    sitesList.innerHTML = html;

    // Attach event listeners for show/copy/delete
    sitesList.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        const pwField = row.querySelector('.password-field');
        const actual = row.querySelector('.actual-password');
        if (actual.classList.contains('hidden')) {
          actual.classList.remove('hidden');
          pwField.classList.add('hidden');
          e.target.textContent = 'Hide';
        } else {
          actual.classList.add('hidden');
          pwField.classList.remove('hidden');
          e.target.textContent = 'Show';
        }
      });
    });

    sitesList.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const pw = e.target.dataset.password || "";
        try {
          await navigator.clipboard.writeText(pw);
          showToast("Password copied!");
        } catch (err) {
          console.error('Failed to copy: ', err);
          showToast("Failed to copy password", true);
        }
      });
    });

    sitesList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('tr');
        const id = row.getAttribute('data-id');
        if (!confirm("Are you sure you want to delete this site?")) return;
        try {
          await deleteDoc(doc(db, "sites", id));
          await loadSites();
          showToast("Site deleted successfully!");
        } catch (error) {
          console.error("Error deleting site: ", error);
          showToast("Error deleting site", true);
        }
      });
    });

  } catch (error) {
    console.error("Error loading sites: ", error);
    sitesList.innerHTML = "<p>Error loading data</p>";
  }
}

// Toast
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.backgroundColor = isError ? '#e53e3e' : '#38a169';
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

// escape helper
function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return unsafe.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Event listeners for DOM elements & Enter key
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
  });
  document.getElementById('sitePassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addSite();
  });

  document.getElementById('loginBtn').addEventListener('click', login);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('addSiteBtn').addEventListener('click', addSite);
});

// Export some functions to window so inline handlers (if any) still work
window.login = login;
window.logout = logout;
window.addSite = addSite;
window.loadSites = loadSites;

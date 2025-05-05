// --- Firebase Configuration ---
// Replace with your actual Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyCDBlEhszh3j8sM6jk8o0x1xykwSDpXxsA",
    authDomain: "shluchimware.firebaseapp.com",
    projectId: "shluchimware",
    storageBucket: "shluchimware.firebasestorage.app",
    messagingSenderId: "720145680794",
    appId: "1:720145680794:web:76bb93bd0933b94afcd223",
    measurementId: "G-T7GF1F1Y0P"
  };

// --- Initialize Firebase ---
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const Timestamp = firebase.firestore.Timestamp; // Alias for convenience

// Bootstrap Modal Instances (to control them programmatically)
let addAccountModalInstance = null;
let addExpenseTypeModalInstance = null;
let editAccountModalInstance = null; // Added
let editExpenseTypeModalInstance = null; // Added
let requestFundModalInstance = null;
let approveRequestModalInstance = null; // Added for approving requests
let appToastInstance = null; // For notifications

// --- Global State ---
let currentUser = null;
let userRole = null; // 'admin', 'basic', or null
let accountsCache = []; // Cache accounts for dropdowns/lookups
let expenseTypesCache = []; // Cache expense types

let currentAccountId = null; // For account_view page
// --- Page Detection ---
const currentPage = window.location.pathname; // e.g., "/login.html", "/dashboard.html"

// --- Utility Functions ---

// Show Bootstrap Toast Notification
function showToast(title, message, type = 'info') { // type can be 'info', 'success', 'warning', 'danger'
    const toastEl = document.getElementById('appToast');
    const toastTitleEl = document.getElementById('toastTitle');
    const toastBodyEl = document.getElementById('toastBody');

    if (!toastEl || !toastTitleEl || !toastBodyEl) {
        console.warn("Toast elements not found.");
        alert(`${title}: ${message}`); // Fallback
        return;
    }

    // Remove previous background classes
    toastEl.classList.remove('bg-info', 'bg-success', 'bg-warning', 'bg-danger', 'text-white');
    toastTitleEl.classList.remove('text-white');
    toastBodyEl.classList.remove('text-white');
    toastEl.querySelector('.btn-close')?.classList.remove('btn-close-white');


    // Set title and body
    toastTitleEl.textContent = title;
    toastBodyEl.textContent = message;

    // Apply background based on type
    let bgClass = 'bg-info'; // Default
    let textClass = 'text-dark'; // Default text
    switch (type) {
        case 'success': bgClass = 'bg-success'; textClass = 'text-white'; break;
        case 'warning': bgClass = 'bg-warning'; textClass = 'text-dark'; break;
        case 'danger': bgClass = 'bg-danger'; textClass = 'text-white'; break;
        case 'info': bgClass = 'bg-info'; textClass = 'text-dark'; break; // Explicitly set info
    }
    toastEl.classList.add(bgClass);
    if (textClass === 'text-white') {
        toastTitleEl.classList.add('text-white');
        toastBodyEl.classList.add('text-white');
        toastEl.querySelector('.btn-close')?.classList.add('btn-close-white');
    }


    if (!appToastInstance) {
        appToastInstance = new bootstrap.Toast(toastEl, { delay: 5000 }); // Auto-hide after 5 seconds
    }
    appToastInstance.show();
}

// Helper to format date for display
function formatDate(timestamp) {
    if (!timestamp || typeof timestamp.toDate !== 'function') return 'N/A';
    try {
        return timestamp.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
        console.error("Error formatting date:", timestamp, e);
        return 'Invalid Date';
    }
}

// Helper to format currency
function formatCurrency(amount) {
    if (typeof amount !== 'number') return 'N/A';
    return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// Helper to get status badge class
function getStatusBadgeClass(status) {
    switch (status?.toLowerCase()) {
        case 'pending': return 'status-pending';
        case 'paid': return 'status-paid';
        case 'approved': return 'status-approved';
        case 'cancelled': return 'status-cancelled';
        case 'rejected': return 'status-rejected';
        default: return 'bg-secondary';
    }
}

// Helper function to safely escape HTML
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    // Ensure input is a string before replacing
    str = String(str);
    return str.replace(/[&<>"']/g, function(match) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[match];
    });
}

// --- Authentication Listener ---
auth.onAuthStateChanged(async (user) => {
    const isAuthPage = currentPage.includes('login.html');
    const logoutBtn = document.getElementById('logout-btn'); // Get logout button reference

    if (user) {
        currentUser = user;
        console.log("User logged in:", user.email);
        if (logoutBtn) logoutBtn.style.display = 'inline-block'; // Show logout button

        await fetchUserRole(user.uid); // Fetch role immediately

        if (isAuthPage) {
            // If logged in and on login page, redirect to dashboard
            window.location.href = 'dashboard.html';
        } else {
            // Logged in and on an app page, initialize common UI and page-specific logic
            initializeCommonUI(user); // Setup navbar, etc.
            initializePageSpecificLogic(); // Run functions for the current page
        }
    } else {
        currentUser = null;
        userRole = null;
        console.log("User logged out or not logged in.");
        if (logoutBtn) logoutBtn.style.display = 'none'; // Hide logout button

        if (!isAuthPage) {
            // If not logged in and not on an auth page, redirect to login
            console.log("Redirecting to login page.");
            window.location.href = 'login.html';
        } else {
             // On login page and not logged in - do nothing, show login form
             console.log("On login page, awaiting login/signup.");
             // Ensure auth listeners are attached if they weren't already
             attachAuthListeners();
        }
    }
});

// --- Fetch User Role ---
async function fetchUserRole(uid) {
    const userRoleDisplay = document.getElementById('user-role'); // Get role display element
    try {
        const roleDoc = await db.collection('roles').doc(uid).get();
        if (roleDoc.exists) {
            userRole = roleDoc.data().role;
            console.log(`User role fetched: ${userRole}`);
        } else {
            console.log("No role document found for user, assigning 'basic'.");
            userRole = 'basic'; // Assign default role
            // Create the role document for the user
            await db.collection('roles').doc(uid).set({
                email: currentUser.email, // Assuming currentUser is available
                role: 'basic'
            }, { merge: true }); // Use merge to avoid overwriting if created concurrently
            console.log("Created default 'basic' role document for user.");
        }
    } catch (error) {
        console.error("Error fetching or setting user role:", error);
        userRole = null; // Handle error case
        showToast("Role Error", "Could not determine user role.", "danger");
    }
    // Update role display if element exists
     if (userRoleDisplay) {
        userRoleDisplay.textContent = userRole ? `Role: ${userRole}` : 'Role: Error';
        userRoleDisplay.className = userRole ? `badge bg-info text-dark fs-6 text-capitalize` : `badge bg-danger fs-6`; // Use Bootstrap badge classes
     }
}

// --- Initialize Common UI Elements (e.g., Navbar) ---
function initializeCommonUI(user) {
    const userInfoSpan = document.getElementById('user-info');
    const logoutBtn = document.getElementById('logout-btn');
    const navAdmin = document.getElementById('nav-admin');
    const navRequests = document.getElementById('nav-requests');

    if (userInfoSpan) userInfoSpan.textContent = `Logged in as: ${escapeHTML(user.email)}`;

    // Ensure logout listener is attached only once
    if (logoutBtn && !logoutBtn.dataset.listenerAttached) {
         logoutBtn.addEventListener('click', () => {
            console.log("Logout button clicked");
            auth.signOut().catch(error => {
                console.error("Sign out error:", error);
                showToast("Logout Error", "Failed to log out.", "danger");
            });
         });
         logoutBtn.dataset.listenerAttached = 'true';
    }

    // Show/hide nav links based on role
    if (navAdmin) navAdmin.style.display = userRole === 'admin' ? 'block' : 'none';
    if (navRequests) navRequests.style.display = userRole === 'basic' ? 'block' : 'none';

    // Highlight active nav link based on current page
    document.querySelectorAll('.navbar .nav-link').forEach(link => {
        // Check if the link's href matches the end of the current page path
        if (link.getAttribute('href') === currentPage.substring(currentPage.lastIndexOf('/') + 1)) {
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
        } else {
            link.classList.remove('active');
            link.removeAttribute('aria-current');
        }
    });


    // Update role display (already done in fetchUserRole, but can be reinforced here if needed)
    const userRoleDisplay = document.getElementById('user-role');
     if (userRoleDisplay && userRole) {
        userRoleDisplay.textContent = `Role: ${userRole}`;
        userRoleDisplay.className = `badge bg-info text-dark fs-6 text-capitalize`;
     }

     // Initialize Toast component if not already done
     const toastEl = document.getElementById('appToast');
     if (toastEl && !appToastInstance) {
         appToastInstance = new bootstrap.Toast(toastEl, { delay: 5000 }); // Auto-hide after 5 seconds
     }
}

// --- Initialize Page-Specific Logic ---
async function initializePageSpecificLogic() {
    if (!currentUser || !userRole) {
        console.warn("Cannot initialize page logic without user or role.");
        // Redirect if role check fails unexpectedly after login attempt on non-login page
        if (!currentPage.includes('login.html')) {
            console.log("User or role missing on protected page, redirecting to login.");
            window.location.href = 'login.html';
        }
        return;
    }

    console.log(`Initializing logic for page: ${currentPage} with role: ${userRole}`);

    // Pre-load common data needed across pages (accounts, types)
    // These are needed for dropdowns and rendering names in tables
    await loadAccountsCache();
    await loadExpenseTypesCache();

    // --- Login Page Logic ---
    if (currentPage.includes('login.html')) {
        // Auth listeners attached separately
    }
    // --- Dashboard Page Logic ---
    else if (currentPage.includes('dashboard.html')) {
        attachDashboardListeners();
        loadAccountsIntoSelects(); // Use cached data
        loadExpenseTypesIntoSelects(); // Use cached data
        loadIncomeList(); // Keep recent lists on dashboard
        loadExpenseList(); // Keep recent lists on dashboard
    }
    // --- Admin Page Logic ---
    else if (currentPage.includes('admin.html')) {
        if (userRole !== 'admin') {
            console.warn("Non-admin attempting to access admin page.");
            document.getElementById('admin-content').style.display = 'none';
            document.getElementById('admin-access-denied').style.display = 'block';
            return; // Stop further execution for this page
        }
        // Show admin content now that role is confirmed
        document.getElementById('admin-content').style.display = 'block';
        document.getElementById('admin-access-denied').style.display = 'none';

        // Initialize Bootstrap Modals for Admin page
        const addAccountModalEl = document.getElementById('addAccountModal');
        if (addAccountModalEl) addAccountModalInstance = new bootstrap.Modal(addAccountModalEl);
        const addExpenseTypeModalEl = document.getElementById('addExpenseTypeModal');
        if (addExpenseTypeModalEl) addExpenseTypeModalInstance = new bootstrap.Modal(addExpenseTypeModalEl);
        const editAccountModalEl = document.getElementById('editAccountModal'); // Added
        if (editAccountModalEl) editAccountModalInstance = new bootstrap.Modal(editAccountModalEl); // Added
        const editExpenseTypeModalEl = document.getElementById('editExpenseTypeModal'); // Added
        if (editExpenseTypeModalEl) editExpenseTypeModalInstance = new bootstrap.Modal(editExpenseTypeModalEl); // Added
        const approveRequestModalEl = document.getElementById('approveRequestModal'); // Added
        if (approveRequestModalEl) approveRequestModalInstance = new bootstrap.Modal(approveRequestModalEl); // Added

        attachAdminListeners(); // Includes modal form submissions
        loadAccountsTable(); // Changed to table
        loadExpenseTypesTable(); // Changed to table
        loadAdminRequests();
    }
    // --- Requests Page Logic ---
    else if (currentPage.includes('requests.html')) {
         if (userRole !== 'basic') {
            // Allow admins to view it too? For now, just log.
            console.log("Non-basic user on requests page.");
            // Optional: redirect if needed: window.location.href = 'dashboard.html';
         }
         // Initialize Bootstrap Modal for Requests page
         const requestFundModalEl = document.getElementById('requestFundModal');
         if (requestFundModalEl) requestFundModalInstance = new bootstrap.Modal(requestFundModalEl);

        attachRequestListeners();
        loadMyRequests();
    }
    // --- Income Page Logic ---
    else if (currentPage.includes('income.html')) {
        attachIncomePageListeners();
        loadIncomeTable(); // Load full table
    }
    // --- Expenses Page Logic ---
    else if (currentPage.includes('expenses.html')) {
        attachExpensePageListeners();
        loadExpenseTable(); // Load full table
    }
    // --- Account View Page Logic ---
    else if (currentPage.includes('account_view.html')) {
        const params = new URLSearchParams(window.location.search);
        currentAccountId = params.get('id');
        loadAccountViewData(currentAccountId);
    }
}

// --- Event Listener Attachment Functions ---
function attachAuthListeners() {
    // Ensure listeners are only attached once
    if (document.body.dataset.authListenersAttached === 'true') return;

    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const authError = document.getElementById('auth-error');

    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            const email = emailInput.value;
            const password = passwordInput.value;
            authError.style.display = 'none'; // Hide previous errors
            loginBtn.disabled = true; // Prevent double clicks
            signupBtn.disabled = true;

            auth.signInWithEmailAndPassword(email, password)
                .then(() => {
                    console.log("Login successful, auth listener will redirect.");
                    // No redirect here, onAuthStateChanged handles it
                })
                .catch(error => {
                    console.error("Login Failed:", error);
                    authError.textContent = `Login Failed: ${error.message}`;
                    authError.style.display = 'block';
                })
                .finally(() => {
                    loginBtn.disabled = false;
                    signupBtn.disabled = false;
                });
        });
    }

    if (signupBtn) {
         signupBtn.addEventListener('click', () => {
            const email = emailInput.value;
            const password = passwordInput.value;
             authError.style.display = 'none'; // Hide previous errors
             loginBtn.disabled = true;
             signupBtn.disabled = true;

            auth.createUserWithEmailAndPassword(email, password)
                .then(async (userCredential) => {
                    console.log("Signup successful, assigning role...");
                    const uid = userCredential.user.uid;
                    try {
                        // Assign default 'basic' role
                        await db.collection('roles').doc(uid).set({
                            email: email,
                            role: 'basic'
                        }, { merge: true }); // Use merge just in case
                        console.log("Default 'basic' role assigned.");
                        // Auth listener will handle the redirect after role is set
                        // No explicit redirect needed here.
                    } catch (roleError) {
                        console.error("Error setting default role:", roleError);
                        authError.textContent = "Signup successful, but failed to set default role.";
                         authError.style.display = 'block';
                    }
                })
                .catch(error => {
                    console.error("Sign Up Failed:", error);
                     authError.textContent = `Sign Up Failed: ${error.message}`;
                     authError.style.display = 'block';
                })
                .finally(() => {
                    loginBtn.disabled = false;
                    signupBtn.disabled = false;
                });
        });
    }
    document.body.dataset.authListenersAttached = 'true'; // Mark as attached
}

function attachDashboardListeners() {
    if (document.body.dataset.dashboardListenersAttached === 'true') return;

    const incomeForm = document.getElementById('income-form');
    const expenseForm = document.getElementById('expense-form');

    if (incomeForm) {
        incomeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('add-income-btn');
            btn.disabled = true; // Disable button during submission

            const desc = document.getElementById('income-desc').value;
            const amount = parseFloat(document.getElementById('income-amount').value);
            const source = document.getElementById('income-source').value;
            const accountId = document.getElementById('income-account-select').value;
            const date = document.getElementById('income-date').value;

            if (!desc || isNaN(amount) || amount <= 0 || !source || !accountId || !date) {
                showToast("Input Error", "Please fill all income fields correctly (amount > 0).", "warning");
                btn.disabled = false;
                return;
            }
            await addIncome(desc, amount, source, accountId, date);
            incomeForm.reset(); // Clear form
            btn.disabled = false;
        });
    }

    if (expenseForm) {
        expenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
             const btn = document.getElementById('add-expense-btn');
             btn.disabled = true;

            const desc = document.getElementById('expense-desc').value;
            const amount = parseFloat(document.getElementById('expense-amount').value);
            const accountId = document.getElementById('expense-account-select').value;
            const typeId = document.getElementById('expense-type-select').value;
            const date = document.getElementById('expense-date').value;

             if (!desc || isNaN(amount) || amount <= 0 || !accountId || !typeId || !date) {
                showToast("Input Error", "Please fill all expense fields correctly (amount > 0).", "warning");
                btn.disabled = false;
                return;
            }
            await addExpense(desc, amount, accountId, typeId, null, date); // Assuming no subtype for now
            expenseForm.reset(); // Clear form
            btn.disabled = false;
        });
    }

    // Add listeners for status updates within the lists (delegated)
    document.getElementById('income-list')?.addEventListener('click', handleStatusUpdate);
    // Note: Status updates might be moved primarily to the dedicated income/expense pages later
    document.getElementById('expense-list')?.addEventListener('click', handleStatusUpdate);

    document.body.dataset.dashboardListenersAttached = 'true';
}

function attachAdminListeners() {
    if (document.body.dataset.adminListenersAttached === 'true') return;

    const addAccountForm = document.getElementById('add-account-form');
    const addExpTypeForm = document.getElementById('add-exp-type-form');
    const editAccountForm = document.getElementById('edit-account-form'); // Added
    const editExpTypeForm = document.getElementById('edit-exp-type-form'); // Added
    const approveRequestForm = document.getElementById('approve-request-form'); // Added

    if (addAccountForm) {
        addAccountForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('add-account-submit-btn');
            btn.disabled = true;

            const name = document.getElementById('account-name').value.trim();
            const type = document.getElementById('account-type').value.trim();
            const owner = document.getElementById('account-owner').value.trim();
            const notes = document.getElementById('account-notes').value.trim();

            if (!name || !type || !owner) {
                showToast("Input Error", "Please fill in Account Name, Type, and Owner.", "warning");
                btn.disabled = false;
                return;
            }
            await addAccount(name, type, owner, notes);
            addAccountForm.reset();
            addAccountModalInstance?.hide(); // Hide modal using Bootstrap JS instance
            btn.disabled = false;
        });
    }

     if (addExpTypeForm) {
        addExpTypeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('add-exp-type-submit-btn');
            btn.disabled = true;

            const name = document.getElementById('exp-type-name').value.trim();
            if (!name) {
                showToast("Input Error", "Please enter an Expense Type Name.", "warning");
                btn.disabled = false;
                return;
            }
            await addExpenseType(name);
            addExpTypeForm.reset();
            addExpenseTypeModalInstance?.hide(); // Hide modal
            btn.disabled = false;
        });
    }

    // Added: Listener for Edit Account Form
    if (editAccountForm) {
        editAccountForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('edit-account-submit-btn');
            btn.disabled = true;

            const accountId = document.getElementById('edit-account-id').value;
            const name = document.getElementById('edit-account-name').value.trim();
            const type = document.getElementById('edit-account-type').value.trim();
            const owner = document.getElementById('edit-account-owner').value.trim();
            const notes = document.getElementById('edit-account-notes').value.trim();

            if (!accountId || !name || !type || !owner) {
                showToast("Input Error", "Account ID missing or required fields empty.", "warning");
                btn.disabled = false;
                return;
            }
            await editAccount(accountId, { name, type, owner, notes });
            editAccountModalInstance?.hide();
            btn.disabled = false;
        });
    }

    // Added: Listener for Edit Expense Type Form
    if (editExpTypeForm) {
        editExpTypeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('edit-exp-type-submit-btn');
            btn.disabled = true;
            const typeId = document.getElementById('edit-exp-type-id').value;
            const name = document.getElementById('edit-exp-type-name').value.trim();
            if (!typeId || !name) {
                 showToast("Input Error", "Type ID missing or name is empty.", "warning");
                 btn.disabled = false;
                 return;
            }
            await editExpenseType(typeId, { name });
            editExpenseTypeModalInstance?.hide();
            btn.disabled = false;
        });
    }

    // Added: Listener for Approve Request Modal Form
    if (approveRequestForm) {
        approveRequestForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('confirm-approve-btn');
            btn.disabled = true;

            const requestId = document.getElementById('approve-request-id').value;
            const description = document.getElementById('approve-expense-desc').value.trim();
            const amount = parseFloat(document.getElementById('approve-expense-amount').value);
            const accountId = document.getElementById('approve-account-select').value;
            const typeId = document.getElementById('approve-type-select').value;
            const expenseDate = document.getElementById('approve-expense-date').value;

            if (!requestId || !description || isNaN(amount) || amount <= 0 || !accountId || !typeId || !expenseDate) {
                showToast("Input Error", "Please fill all fields correctly in the approval form.", "warning");
                btn.disabled = false;
                return;
            }

            try {
                // Pass data to a function that handles the actual creation and update
                await finalizeRequestApproval(requestId, description, amount, accountId, typeId, expenseDate);
                approveRequestModalInstance?.hide();
                loadAdminRequests(); // Refresh the list
            } catch (error) {
                // Error handled within finalizeRequestApproval, just log here if needed
                console.error("Error during final approval step:", error);
                // Keep modal open on error? Or rely on toast? For now, keep open.
            } finally {
                btn.disabled = false;
            }
        });
    }

    // Listener for request approval/rejection buttons (delegated)
    document.getElementById('requests-list-admin')?.addEventListener('click', handleRequestAction);

    // Added: Listeners for Edit/Delete buttons in tables (delegated)
    document.getElementById('accounts-table-body')?.addEventListener('click', handleAdminTableActions);
    document.getElementById('exp-types-table-body')?.addEventListener('click', handleAdminTableActions);

    document.body.dataset.adminListenersAttached = 'true';
}

function attachRequestListeners() {
     if (document.body.dataset.requestListenersAttached === 'true') return;

     const requestFundForm = document.getElementById('request-fund-form');
     if (requestFundForm) {
        requestFundForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submit-request-btn');
            btn.disabled = true;

            const desc = document.getElementById('request-desc').value.trim();
            const amount = parseFloat(document.getElementById('request-amount').value);
            const reason = document.getElementById('request-reason').value.trim();

            if (!desc || isNaN(amount) || amount <= 0 || !reason) {
                 showToast("Input Error", "Please fill all request fields correctly (amount > 0).", "warning");
                 btn.disabled = false;
                return;
            }
            await submitRequest(desc, amount, reason);
            requestFundForm.reset();
            requestFundModalInstance?.hide(); // Hide modal
            btn.disabled = false;
        });
     }
     document.body.dataset.requestListenersAttached = 'true';
}

// Added: Listeners for Income Page (mainly status updates)
function attachIncomePageListeners() {
    if (document.body.dataset.incomeListenersAttached === 'true') return;
    document.getElementById('income-table-body')?.addEventListener('click', handleStatusUpdate);
    document.body.dataset.incomeListenersAttached = 'true';
}

// Added: Listeners for Expense Page (mainly status updates)
function attachExpensePageListeners() {
    if (document.body.dataset.expenseListenersAttached === 'true') return;
    document.getElementById('expense-table-body')?.addEventListener('click', handleStatusUpdate);
    document.body.dataset.expenseListenersAttached = 'true';
}


// --- Data Caching ---
async function loadAccountsCache() {
    try {
        const snapshot = await db.collection('accounts').orderBy('name').get();
        accountsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Accounts cache loaded:", accountsCache.length);
    } catch (error) {
        console.error("Error loading accounts cache:", error);
        showToast("Data Error", "Could not load accounts.", "danger");
        accountsCache = [];
    }
}

async function loadExpenseTypesCache() {
     try {
        const snapshot = await db.collection('expenseTypes').orderBy('name').get();
        expenseTypesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Expense types cache loaded:", expenseTypesCache.length);
    } catch (error) {
        console.error("Error loading expense types cache:", error);
        showToast("Data Error", "Could not load expense types.", "danger");
        expenseTypesCache = [];
    }
}

// --- Firestore Interaction Functions ---

// --- Income ---
async function addIncome(description, amount, source, accountId, receivedDate) {
    if (!currentUser) return;
    try {
        await db.collection('income').add({
            description: description,
            amount: amount,
            source: source,
            accountId: accountId,
            status: 'pending', // Default status
            receivedDate: Timestamp.fromDate(new Date(receivedDate)),
            recordedByUid: currentUser.uid,
            recordedByEmail: currentUser.email, // Store email for easier display
            createdAt: Timestamp.now()
        });
        showToast("Success", "Income logged successfully.", "success");
        loadIncomeList(); // Refresh list on dashboard
        if (currentPage.includes('income.html')) loadIncomeTable(); // Refresh table if on income page
    } catch (error) {
        console.error("Error adding income: ", error);
        showToast("Error", "Failed to add income.", "danger");
    }
}

async function loadIncomeList() { // For Dashboard List
    const listDiv = document.getElementById('income-list');
    if (!listDiv) return;
    listDiv.innerHTML = '<div class="list-group-item text-muted">Loading income...</div>';

    try {
        const snapshot = await db.collection('income')
                                 .orderBy('receivedDate', 'desc')
                                 .limit(5) // Load fewer for dashboard list
                                 .get();

        if (snapshot.empty) {
            listDiv.innerHTML = '<div class="list-group-item text-muted">No recent income records.</div>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const income = doc.data();
            const incomeId = doc.id;
            const accountName = accountsCache.find(acc => acc.id === income.accountId)?.name || 'Unknown Account';

            // Determine which buttons to show based on status and role
            let buttons = '';
            if (income.status === 'pending' && (userRole === 'admin' || userRole === 'basic')) { // Allow basic users to mark as paid/cancel
                 buttons = `
                    <button class="btn btn-success btn-sm ms-1" title="Mark as Paid" data-id="${incomeId}" data-action="paid" data-collection="income"><i class="bi bi-check-circle-fill"></i> Paid</button>
                    <button class="btn btn-secondary btn-sm ms-1" title="Cancel Record" data-id="${incomeId}" data-action="cancelled" data-collection="income"><i class="bi bi-x-circle-fill"></i> Cancel</button>
                 `;
            } else if (income.status === 'paid' && (userRole === 'admin' || userRole === 'basic')) { // Allow basic users to revert to pending
                 buttons = `
                    <button class="btn btn-warning btn-sm ms-1" title="Mark as Pending" data-id="${incomeId}" data-action="pending" data-collection="income"><i class="bi bi-arrow-counterclockwise"></i> Pending</button>
                 `;
            } else if (income.status === 'cancelled' && (userRole === 'admin' || userRole === 'basic')) { // Allow basic users to revert to pending
                 buttons = `
                    <button class="btn btn-warning btn-sm ms-1" title="Mark as Pending" data-id="${incomeId}" data-action="pending" data-collection="income"><i class="bi bi-arrow-counterclockwise"></i> Pending</button>
                 `;
            }


            html += `
             <div class="list-group-item d-flex flex-wrap justify-content-between align-items-center">
                 <div class="me-3">
                     <span class="fw-bold">${escapeHTML(income.description)}</span>
                     <small class="text-muted d-block">
                         Source: ${escapeHTML(income.source)} | Account: ${escapeHTML(accountName)} | Date: ${formatDate(income.receivedDate)}
                     </small>
                 </div>
                 <div class="d-flex align-items-center mt-1 mt-md-0">
                     <span class="fw-bold me-2">${formatCurrency(income.amount)}</span>
                     <span class="badge ${getStatusBadgeClass(income.status)} text-capitalize me-2">${escapeHTML(income.status)}</span>
                     ${buttons}
                 </div>
             </div>`;
        });
        listDiv.innerHTML = html;

    } catch (error) {
        console.error("Error loading income list:", error);
        listDiv.innerHTML = '<div class="list-group-item text-danger">Error loading income records.</div>';
        // Don't show toast for dashboard list load failure, less critical
    }
}

// Added: Load full income table for income.html
async function loadIncomeTable() {
    const tableBody = document.getElementById('income-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Loading income records...</td></tr>';

    try {
        // Load more records for the dedicated page, maybe add pagination later
        const snapshot = await db.collection('income')
                                 .orderBy('receivedDate', 'desc')
                                 .limit(50) // Load more for the table view
                                 .get();

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No income records found.</td></tr>';
            return;
        }

        let rowsHtml = '';
        snapshot.forEach(doc => {
            const income = doc.data();
            const incomeId = doc.id;
            const accountName = accountsCache.find(acc => acc.id === income.accountId)?.name || 'Unknown Account';

            // Determine which buttons to show based on status and role
            let buttons = '';
            // Status change buttons for admin OR basic
            if (income.status === 'pending' && (userRole === 'admin' || userRole === 'basic')) {
                buttons += `<button class="btn btn-success btn-sm" title="Mark as Paid" data-id="${incomeId}" data-action="paid" data-collection="income"><i class="bi bi-check-circle-fill"></i></button>
                            <button class="btn btn-secondary btn-sm ms-1" title="Cancel Record" data-id="${incomeId}" data-action="cancelled" data-collection="income"><i class="bi bi-x-circle-fill"></i></button>`;
            } else if (['paid', 'cancelled'].includes(income.status) && (userRole === 'admin' || userRole === 'basic')) { // paid or cancelled
                buttons += `<button class="btn btn-warning btn-sm" title="Mark as Pending" data-id="${incomeId}" data-action="pending" data-collection="income"><i class="bi bi-arrow-counterclockwise"></i></button>`;
            }
            // Delete button only for admin
            if (userRole === 'admin') {
                // Add delete button for admins regardless of status
                buttons += `<button class="btn btn-danger btn-sm ms-1" title="Delete Record Permanently" data-id="${incomeId}" data-action="delete" data-collection="income"><i class="bi bi-trash-fill"></i></button>`;
            }

            rowsHtml += `
             <tr>
                 <td>${formatDate(income.receivedDate)}</td>
                 <td>${escapeHTML(income.description)}</td>
                 <td>${escapeHTML(income.source)}</td>
                 <td>${escapeHTML(accountName)}</td>
                 <td class="text-end">${formatCurrency(income.amount)}</td>
                 <td><span class="badge ${getStatusBadgeClass(income.status)} text-capitalize">${escapeHTML(income.status)}</span></td>
                 <td>${buttons}</td>
             </tr>`;
        });
        tableBody.innerHTML = rowsHtml;

    } catch (error) {
        console.error("Error loading income table:", error);
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error loading income records.</td></tr>';
        showToast("Error", "Could not load income table.", "danger");
    }
}

// --- Expenses ---
async function addExpense(description, amount, accountId, expenseTypeId, expenseSubTypeId, expenseDate) {
     if (!currentUser) return;
    try {
        await db.collection('expenses').add({
            description: description,
            amount: amount,
            accountId: accountId,
            expenseTypeId: expenseTypeId,
            expenseSubTypeId: expenseSubTypeId || null, // Handle optional subtype
            status: 'pending', // Default status
            expenseDate: Timestamp.fromDate(new Date(expenseDate)),
            recordedByUid: currentUser.uid,
            recordedByEmail: currentUser.email,
            createdAt: Timestamp.now()
        });
        showToast("Success", "Expense logged successfully.", "success");
        loadExpenseList(); // Refresh list on dashboard
        if (currentPage.includes('expenses.html')) loadExpenseTable(); // Refresh table if on expense page
    } catch (error) {
        console.error("Error adding expense: ", error);
        showToast("Error", "Failed to add expense.", "danger");
    }
}

async function loadExpenseList() { // For Dashboard List
     const listDiv = document.getElementById('expense-list');
    if (!listDiv) return;
    listDiv.innerHTML = '<div class="list-group-item text-muted">Loading expenses...</div>';

     try {
        const snapshot = await db.collection('expenses')
                                 .orderBy('expenseDate', 'desc')
                                 .limit(5) // Load fewer for dashboard list
                                 .get();

        if (snapshot.empty) {
            listDiv.innerHTML = '<div class="list-group-item text-muted">No recent expense records.</div>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const expense = doc.data();
            const expenseId = doc.id;
            const accountName = accountsCache.find(acc => acc.id === expense.accountId)?.name || 'Unknown Account';
            const typeName = expenseTypesCache.find(type => type.id === expense.expenseTypeId)?.name || 'Unknown Type';

            // Determine which buttons to show based on status and role
            // Allow admin OR basic user to change status on dashboard.
            let buttons = '';
             if (expense.status === 'pending' && (userRole === 'admin' || userRole === 'basic')) {
                 buttons = `
                    <button class="btn btn-success btn-sm ms-1" title="Mark as Paid" data-id="${expenseId}" data-action="paid" data-collection="expenses"><i class="bi bi-check-circle-fill"></i> Paid</button>
                    <button class="btn btn-secondary btn-sm ms-1" title="Cancel Record" data-id="${expenseId}" data-action="cancelled" data-collection="expenses"><i class="bi bi-x-circle-fill"></i> Cancel</button>
                 `;
            } else if (expense.status === 'paid' && (userRole === 'admin' || userRole === 'basic')) {
                 buttons = `
                    <button class="btn btn-warning btn-sm ms-1" title="Mark as Pending" data-id="${expenseId}" data-action="pending" data-collection="expenses"><i class="bi bi-arrow-counterclockwise"></i> Pending</button>
                 `;
            } else if (expense.status === 'cancelled' && (userRole === 'admin' || userRole === 'basic')) {
                 buttons = `
                    <button class="btn btn-warning btn-sm ms-1" title="Mark as Pending" data-id="${expenseId}" data-action="pending" data-collection="expenses"><i class="bi bi-arrow-counterclockwise"></i> Pending</button>
                 `;
            }

            html += `
             <div class="list-group-item d-flex flex-wrap justify-content-between align-items-center">
                 <div class="me-3">
                     <span class="fw-bold">${escapeHTML(expense.description)}</span>
                     <small class="text-muted d-block">
                         Type: ${escapeHTML(typeName)} | Account: ${escapeHTML(accountName)} | Date: ${formatDate(expense.expenseDate)}
                     </small>
                 </div>
                 <div class="d-flex align-items-center mt-1 mt-md-0">
                     <span class="fw-bold me-2">${formatCurrency(expense.amount)}</span>
                     <span class="badge ${getStatusBadgeClass(expense.status)} text-capitalize me-2">${escapeHTML(expense.status)}</span>
                     ${buttons}
                 </div>
             </div>`;
        });
        listDiv.innerHTML = html;

    } catch (error) {
        console.error("Error loading expense list:", error);
        listDiv.innerHTML = '<div class="list-group-item text-danger">Error loading expense records.</div>';
        // Don't show toast for dashboard list load failure
    }
}

// Added: Load full expense table for expenses.html
async function loadExpenseTable() {
    const tableBody = document.getElementById('expense-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Loading expense records...</td></tr>';

    try {
        // Load more records for the dedicated page, maybe add pagination later
        const snapshot = await db.collection('expenses')
                                 .orderBy('expenseDate', 'desc')
                                 .limit(50) // Load more for the table view
                                 .get();

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No expense records found.</td></tr>';
            return;
        }

        let rowsHtml = '';
        snapshot.forEach(doc => {
            const expense = doc.data();
            const expenseId = doc.id;
            const accountName = accountsCache.find(acc => acc.id === expense.accountId)?.name || 'Unknown Account';
            const typeName = expenseTypesCache.find(type => type.id === expense.expenseTypeId)?.name || 'Unknown Type';

            // Determine which buttons to show based on status and role
            let buttons = '';
            // Status change buttons for admin OR basic
            if (expense.status === 'pending' && (userRole === 'admin' || userRole === 'basic')) {
                buttons += `<button class="btn btn-success btn-sm" title="Mark as Paid" data-id="${expenseId}" data-action="paid" data-collection="expenses"><i class="bi bi-check-circle-fill"></i></button>
                            <button class="btn btn-secondary btn-sm ms-1" title="Cancel Record" data-id="${expenseId}" data-action="cancelled" data-collection="expenses"><i class="bi bi-x-circle-fill"></i></button>`;
            } else if (['paid', 'cancelled'].includes(expense.status) && (userRole === 'admin' || userRole === 'basic')) { // paid or cancelled
                buttons += `<button class="btn btn-warning btn-sm" title="Mark as Pending" data-id="${expenseId}" data-action="pending" data-collection="expenses"><i class="bi bi-arrow-counterclockwise"></i></button>`;
            }
            // Delete button only for admin
            if (userRole === 'admin') {
                 // Add delete button for admins regardless of status
                 buttons += `<button class="btn btn-danger btn-sm ms-1" title="Delete Record Permanently" data-id="${expenseId}" data-action="delete" data-collection="expenses"><i class="bi bi-trash-fill"></i></button>`;
            }

            rowsHtml += `
             <tr>
                 <td>${formatDate(expense.expenseDate)}</td>
                 <td>${escapeHTML(expense.description)}</td>
                 <td>${escapeHTML(typeName)}</td>
                 <td>${escapeHTML(accountName)}</td>
                 <td class="text-end">${formatCurrency(expense.amount)}</td>
                 <td><span class="badge ${getStatusBadgeClass(expense.status)} text-capitalize">${escapeHTML(expense.status)}</span></td>
                 <td>${buttons}</td>
             </tr>`;
        });
        tableBody.innerHTML = rowsHtml;

    } catch (error) {
        console.error("Error loading expense table:", error);
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error loading expense records.</td></tr>';
        showToast("Error", "Could not load expense table.", "danger");
    }
}

// --- Status Updates & Deletion ---
async function handleStatusUpdate(event) {
    const button = event.target.closest('button[data-id][data-action][data-collection]');
    if (!button) return; // Click wasn't on an action button

    const docId = button.dataset.id;
    const action = button.dataset.action; // e.g., 'paid', 'cancelled', 'pending', 'delete'
    const collection = button.dataset.collection; // 'income' or 'expenses'

    // Permission Check: Allow status changes for basic/admin, delete only for admin
    if (action === 'delete' && userRole !== 'admin') {
        showToast("Permission Denied", "Only administrators can delete records.", "warning");
        return;
    } else if (!['paid', 'pending', 'cancelled', 'delete'].includes(action)) { // Ensure valid action
        console.warn("Invalid action attempted:", action);
        return;
    }

    if (!docId || !action || !collection) return;

    // Confirmation for destructive actions
    if (action === 'cancelled' && !confirm(`Are you sure you want to cancel this ${collection} record?`)) {
        return;
    }
    if (action === 'delete' && !confirm(`DANGER! Are you sure you want to PERMANENTLY DELETE this ${collection} record? This cannot be undone.`)) {
        return;
    }

    console.log(`Performing action "${action}" on ${collection} ${docId}`);
    button.disabled = true; // Disable button during operation

    try {
        if (action === 'delete') {
            await db.collection(collection).doc(docId).delete();
            showToast("Success", `Record permanently deleted.`, "info");
        } else {
            // Assume it's a status update if not delete
            const newStatus = action;
            await db.collection(collection).doc(docId).update({ status: newStatus });
            showToast("Success", `Record marked as ${newStatus}.`, "success");
        }

        // Refresh the relevant list or table
        if (currentPage.includes('dashboard.html')) {
            if (collection === 'income') loadIncomeList();
            if (collection === 'expenses') loadExpenseList();
        } else if (currentPage.includes('income.html') && collection === 'income') {
            loadIncomeTable();
        } else if (currentPage.includes('expenses.html') && collection === 'expenses') {
            loadExpenseTable();
        }
        // If on account_view page, refresh that specific table
        if (currentPage.includes('account_view.html') && currentAccountId) {
             loadAccountTransactions(currentAccountId, collection, collection === 'income' ? 'account-income-table-body' : 'account-expense-table-body');
        }

    } catch (error) {
        console.error(`Error performing action ${action} on ${collection}:`, error);
        showToast("Error", `Failed to ${action} record.`, "danger");
        button.disabled = false; // Re-enable button on error
    } finally {
        // Ensure button is re-enabled even if list refresh fails (unless it was deleted)
        if (action !== 'delete') {
            button.disabled = false;
        }
    }
}

// --- Accounts (Admin) ---
async function addAccount(name, type, owner, notes) {
     if (userRole !== 'admin') return;
     try {
        await db.collection('accounts').add({
            name: name,
            type: type,
            owner: owner,
            notes: notes,
            createdAt: Timestamp.now()
        });
        showToast("Success", "Account added successfully.", "success");
        await loadAccountsCache(); // Update cache
        loadAccountsTable(); // Refresh admin table
        loadAccountsIntoSelects(); // Refresh dashboard selects
     } catch (error) {
        console.error("Error adding account:", error);
        showToast("Error", "Failed to add account.", "danger");
     }
}

// Added: Edit Account
async function editAccount(accountId, updatedData) {
    if (userRole !== 'admin' || !accountId) return;
    try {
        await db.collection('accounts').doc(accountId).update({
            name: updatedData.name,
            type: updatedData.type,
            owner: updatedData.owner,
            notes: updatedData.notes
            // Avoid updating createdAt
        });
        showToast("Success", "Account updated successfully.", "success");
        await loadAccountsCache(); // Update cache
        loadAccountsTable(); // Refresh admin table
        loadAccountsIntoSelects(); // Refresh dashboard selects
    } catch (error) {
        console.error("Error editing account:", error);
        showToast("Error", "Failed to update account.", "danger");
    }
}

// Added: Delete Account
async function deleteAccount(accountId) {
    if (userRole !== 'admin' || !accountId) return;

    // **Important Consideration:** Check if account is used in income/expenses before deleting?
    if (!confirm(`Are you sure you want to delete this account? This cannot be undone and might affect existing transaction records.`)) {
        return;
    }

    try {
        // Optional: Add check here to see if accountId exists in income or expenses collections
        // const incomeCheck = await db.collection('income').where('accountId', '==', accountId).limit(1).get();
        // const expenseCheck = await db.collection('expenses').where('accountId', '==', accountId).limit(1).get();
        // if (!incomeCheck.empty || !expenseCheck.empty) {
        //     showToast("Deletion Blocked", "Cannot delete account as it is linked to existing transactions.", "warning");
        //     return;
        // }

        await db.collection('accounts').doc(accountId).delete();
        showToast("Success", "Account deleted successfully.", "info");
        await loadAccountsCache(); // Update cache
        loadAccountsTable(); // Refresh admin table
        loadAccountsIntoSelects(); // Refresh dashboard selects
    } catch (error) {
        console.error("Error deleting account:", error);
        showToast("Error", "Failed to delete account.", "danger");
    }
}

// Changed to load into table
async function loadAccountsTable() { // For Admin page table
    const tableBody = document.getElementById('accounts-table-body');
    if (!tableBody || userRole !== 'admin') return;

    if (accountsCache.length === 0) {
         tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No accounts found. Add one using the button above.</td></tr>';
         return;
    }

    let html = '';
    accountsCache.forEach(account => {
        html += `
         <tr>
             <td><a href="account_view.html?id=${account.id}" title="View Transactions">${escapeHTML(account.name)}</a></td>
             <td>${escapeHTML(account.type)}</td>
             <td>${escapeHTML(account.owner)}</td>
             <td>${escapeHTML(account.notes)}</td>
             <td>
                 <button class="btn btn-outline-secondary btn-sm" title="Edit Account"
                         data-id="${account.id}"
                         data-name="${escapeHTML(account.name)}"
                         data-type="${escapeHTML(account.type)}"
                         data-owner="${escapeHTML(account.owner)}"
                         data-notes="${escapeHTML(account.notes)}"
                         data-action="edit-account">
                     <i class="bi bi-pencil"></i>
                 </button>
                 <button class="btn btn-outline-danger btn-sm ms-1" title="Delete Account"
                         data-id="${account.id}"
                         data-action="delete-account">
                     <i class="bi bi-trash"></i>
                 </button>
             </td>
         </tr>`;
    });
    tableBody.innerHTML = html;
}

function loadAccountsIntoSelects() { // For Dashboard dropdowns (uses cache)
    const incomeSelect = document.getElementById('income-account-select');
    const expenseSelect = document.getElementById('expense-account-select');
    if (!incomeSelect || !expenseSelect) return;

    incomeSelect.innerHTML = '<option value="">Select Account...</option>';
    expenseSelect.innerHTML = '<option value="">Select Account...</option>';

    if (accountsCache.length === 0) {
        incomeSelect.innerHTML = '<option value="">No accounts available</option>';
        expenseSelect.innerHTML = '<option value="">No accounts available</option>';
        return;
    }

    accountsCache.forEach(account => {
        const optionHTML = `<option value="${account.id}">${escapeHTML(account.name)} (${escapeHTML(account.type)})</option>`;
        incomeSelect.innerHTML += optionHTML;
        expenseSelect.innerHTML += optionHTML;
    });
}

// --- Expense Types (Admin) ---
async function addExpenseType(name) {
    if (userRole !== 'admin') return;
     try {
        await db.collection('expenseTypes').add({
            name: name,
            createdAt: Timestamp.now()
        });
        showToast("Success", "Expense type added successfully.", "success");
        await loadExpenseTypesCache(); // Update cache
        loadExpenseTypesTable(); // Refresh admin table
        loadExpenseTypesIntoSelects(); // Refresh dashboard select
     } catch (error) {
        console.error("Error adding expense type:", error);
        showToast("Error", "Failed to add expense type.", "danger");
     }
}

// Added: Edit Expense Type
async function editExpenseType(typeId, updatedData) {
    if (userRole !== 'admin' || !typeId) return;
    try {
        await db.collection('expenseTypes').doc(typeId).update({
            name: updatedData.name
        });
        showToast("Success", "Expense type updated successfully.", "success");
        await loadExpenseTypesCache(); // Update cache
        loadExpenseTypesTable(); // Refresh admin table
        loadExpenseTypesIntoSelects(); // Refresh dashboard select
    } catch (error) {
        console.error("Error editing expense type:", error);
        showToast("Error", "Failed to update expense type.", "danger");
    }
}

// Added: Delete Expense Type
async function deleteExpenseType(typeId) {
    if (userRole !== 'admin' || !typeId) return;

    // **Important Consideration:** Check if type is used in expenses before deleting?
    if (!confirm(`Are you sure you want to delete this expense type? This cannot be undone and might affect existing expense records.`)) {
        return;
    }

    try {
         // Optional: Add check here to see if typeId exists in expenses collection
        // const expenseCheck = await db.collection('expenses').where('expenseTypeId', '==', typeId).limit(1).get();
        // if (!expenseCheck.empty) {
        //     showToast("Deletion Blocked", "Cannot delete type as it is linked to existing expenses.", "warning");
        //     return;
        // }

        await db.collection('expenseTypes').doc(typeId).delete();
        showToast("Success", "Expense type deleted successfully.", "info");
        await loadExpenseTypesCache(); // Update cache
        loadExpenseTypesTable(); // Refresh admin table
        loadExpenseTypesIntoSelects(); // Refresh dashboard select
    } catch (error) {
        console.error("Error deleting expense type:", error);
        showToast("Error", "Failed to delete expense type.", "danger");
    }
}

// Changed to load into table
async function loadExpenseTypesTable() { // For Admin page table
    const tableBody = document.getElementById('exp-types-table-body');
    if (!tableBody || userRole !== 'admin') return;

     if (expenseTypesCache.length === 0) {
         tableBody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">No expense types found. Add one using the button above.</td></tr>';
         return;
     }

    let html = '';
    expenseTypesCache.forEach(type => {
        html += `
         <tr>
             <td>${escapeHTML(type.name)}</td>
             <td>
                 <button class="btn btn-outline-secondary btn-sm" title="Edit Type"
                         data-id="${type.id}" data-name="${escapeHTML(type.name)}"
                         data-action="edit-type">
                     <i class="bi bi-pencil"></i>
                 </button>
                 <button class="btn btn-outline-danger btn-sm ms-1" title="Delete Type"
                         data-id="${type.id}" data-action="delete-type">
                     <i class="bi bi-trash"></i>
                 </button>
             </td>
         </tr>`;
    });
    tableBody.innerHTML = html;
}

function loadExpenseTypesIntoSelects() { // For Dashboard dropdown (uses cache)
    const select = document.getElementById('expense-type-select');
    if (!select) return;

    select.innerHTML = '<option value="">Select Type...</option>';

    if (expenseTypesCache.length === 0) {
        select.innerHTML = '<option value="">No types available</option>';
        return;
    }

    expenseTypesCache.forEach(type => {
        select.innerHTML += `<option value="${type.id}">${escapeHTML(type.name)}</option>`;
    });
}

// --- Requests ---
async function submitRequest(description, amount, reason) {
    if (!currentUser) return;
    try {
        await db.collection('expenseRequests').add({
            description: description,
            amount: amount,
            reason: reason,
            status: 'pending',
            requestedByUid: currentUser.uid,
            requestedByEmail: currentUser.email, // Store email for display
            requestedDate: Timestamp.now(),
            createdAt: Timestamp.now()
        });
        showToast("Success", "Expense request submitted successfully.", "success");
        loadMyRequests(); // Refresh user's list
    } catch (error) {
        console.error("Error submitting request:", error);
        showToast("Error", "Failed to submit request.", "danger");
    }
}

async function loadMyRequests() { // For Requests page
    const listDiv = document.getElementById('my-requests-list');
    if (!listDiv || !currentUser) return;
    listDiv.innerHTML = '<div class="list-group-item text-muted">Loading your requests...</div>';

    try {
         const snapshot = await db.collection('expenseRequests')
                                 .where('requestedByUid', '==', currentUser.uid)
                                 .orderBy('requestedDate', 'desc')
                                 .limit(20)
                                 .get();

        if (snapshot.empty) {
            listDiv.innerHTML = '<div class="list-group-item text-muted">You have not submitted any requests yet.</div>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const request = doc.data();
            const requestId = doc.id;

            html += `
             <div class="list-group-item">
                 <div class="d-flex w-100 justify-content-between">
                    <h5 class="mb-1">${escapeHTML(request.description)}</h5>
                    <small>${formatDate(request.requestedDate)}</small>
                 </div>
                 <p class="mb-1">Amount: ${formatCurrency(request.amount)}</p>
                 <p class="mb-1"><small>Reason: ${escapeHTML(request.reason)}</small></p>
                 <small>Status: <span class="badge ${getStatusBadgeClass(request.status)} text-capitalize">${escapeHTML(request.status)}</span></small>
                 ${request.status === 'approved' && request.linkedExpenseId ? `<small class="ms-2"> | Linked Expense ID: ${escapeHTML(request.linkedExpenseId)}</small>` : ''}
                 ${request.status === 'rejected' && request.approvalDate ? `<small class="ms-2 text-danger"> | Rejected on: ${formatDate(request.approvalDate)}</small>` : ''}
             </div>`;
        });
        listDiv.innerHTML = html;

    } catch (error) {
         console.error("Error loading user requests:", error);
        listDiv.innerHTML = '<div class="list-group-item text-danger">Error loading your requests.</div>';
        showToast("Error", "Could not load your requests.", "danger");
    }
}

async function loadAdminRequests() { // For Admin page
    const listDiv = document.getElementById('requests-list-admin');
    if (!listDiv || userRole !== 'admin') return;
    listDiv.innerHTML = '<div class="list-group-item text-muted">Loading pending requests...</div>';

     try {
         const snapshot = await db.collection('expenseRequests')
                                 .where('status', '==', 'pending') // Only show pending requests for action
                                 .orderBy('requestedDate', 'asc') // Show oldest first
                                 .limit(30)
                                 .get();

        if (snapshot.empty) {
            listDiv.innerHTML = '<div class="list-group-item text-muted">No pending requests found.</div>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const request = doc.data();
            const requestId = doc.id;

            html += `
             <div class="list-group-item">
                 <div class="d-flex w-100 justify-content-between">
                    <h5 class="mb-1">${escapeHTML(request.description)}</h5>
                    <small>Requested: ${formatDate(request.requestedDate)}</small>
                 </div>
                 <p class="mb-1">Amount: ${formatCurrency(request.amount)}</p>
                 <p class="mb-1"><small>Reason: ${escapeHTML(request.reason)}</small></p>
                 <p class="mb-1"><small>Requested By: ${escapeHTML(request.requestedByEmail || request.requestedByUid)}</small></p>
                 <div class="mt-2">
                     <button class="btn btn-success btn-sm" data-id="${requestId}" data-action="approve"><i class="bi bi-check-lg"></i> Approve</button>
                     <button class="btn btn-danger btn-sm ms-2" data-id="${requestId}" data-action="reject"><i class="bi bi-x-lg"></i> Reject</button>
                 </div>
             </div>`;
        });
        listDiv.innerHTML = html;

    } catch (error) {
         console.error("Error loading admin requests:", error);
        listDiv.innerHTML = '<div class="list-group-item text-danger">Error loading pending requests.</div>';
        showToast("Error", "Could not load pending requests.", "danger");
    }
}

async function handleRequestAction(event) {
     const button = event.target.closest('button[data-id][data-action]');
    if (!button || userRole !== 'admin') return;

    const action = button.dataset.action; // 'approve' or 'reject'
    const requestId = button.dataset.id;

    if (!requestId || !action) return;

    console.log(`${action} action on request ${requestId}`);
    button.disabled = true; // Prevent double clicks
    // Disable the other button too
    const siblingButton = action === 'approve' ? button.nextElementSibling : button.previousElementSibling;
    if (siblingButton) siblingButton.disabled = true;


    try { // Wrap in try..finally to re-enable buttons if modal opening fails
        const requestRef = db.collection('expenseRequests').doc(requestId);
        const requestSnap = await requestRef.get();
        if (!requestSnap.exists) throw new Error(`Request ${requestId} not found.`);
        const requestData = requestSnap.data();

        // Ensure request is still pending before processing
        if (requestData.status !== 'pending') {
            showToast("Info", "This request has already been processed.", "info");
            loadAdminRequests(); // Refresh list to remove it
            return;
        }

        if (action === 'approve') {
            // --- MODIFIED: Open Modal Instead of Direct Creation ---
            console.log("Opening approval modal for request:", requestId);
            // Populate modal fields
            document.getElementById('approve-request-id').value = requestId;
            document.getElementById('approve-requester-email').textContent = escapeHTML(requestData.requestedByEmail || 'N/A');
            document.getElementById('approve-request-reason').textContent = escapeHTML(requestData.reason || 'N/A');
            document.getElementById('approve-expense-desc').value = escapeHTML(requestData.description || '');
            document.getElementById('approve-expense-amount').value = requestData.amount || '';
            document.getElementById('approve-expense-date').valueAsDate = new Date(); // Default to today
            // Populate dropdowns (using helper functions adapted for modal)
            populateSelectWithOptions('approve-account-select', accountsCache, 'Select Account...');
            populateSelectWithOptions('approve-type-select', expenseTypesCache, 'Select Type...');

            approveRequestModalInstance?.show();

        } else if (action === 'reject') {
            // Update request status
             await requestRef.update({
                status: 'rejected',
                approvedByUid: currentUser.uid, // Log who rejected it
                approvedByEmail: currentUser.email,
                approvalDate: Timestamp.now() // Log rejection time
            });
             showToast("Success", "Request rejected.", "info");
        }
        // Refresh list only after action is fully complete (reject) or modal is submitted (approve)
        if (action === 'reject') {
            loadAdminRequests();
        }
    } catch (error) {
        console.error(`Error processing request action (${action}):`, error);
        showToast("Error", `Failed to ${action} request.`, "danger");
        // Re-enable buttons on error
        button.disabled = false;
        if (siblingButton) siblingButton.disabled = false;
    } finally {
        // Re-enable buttons if it wasn't an approval action (approval buttons re-enabled by modal logic)
        if (action !== 'approve') {
             button.disabled = false;
             if (siblingButton) siblingButton.disabled = false;
        }
    }
}

// --- Helper to populate select dropdowns ---
function populateSelectWithOptions(selectElementId, optionsCache, defaultOptionText) {
    const select = document.getElementById(selectElementId);
    if (!select) return;

    select.innerHTML = `<option value="">${defaultOptionText}</option>`; // Clear existing options and add default

    if (!optionsCache || optionsCache.length === 0) {
        select.innerHTML = `<option value="">No options available</option>`;
        return;
    }

    optionsCache.forEach(option => {
        // Assuming options have 'id' and 'name' properties
        const optionHTML = `<option value="${option.id}">${escapeHTML(option.name)}</option>`;
        select.innerHTML += optionHTML;
    });
}

// --- New Function: Finalize Request Approval (Called by Modal Submit) ---
async function finalizeRequestApproval(requestId, description, amount, accountId, typeId, expenseDate) {
    if (!currentUser || userRole !== 'admin') {
        showToast("Permission Denied", "Admin privileges required.", "danger");
        throw new Error("Permission Denied"); // Throw error to stop processing in caller
    }

    try {
        // 1. Create the expense record with full details
        const expenseRef = await db.collection('expenses').add({
            description: description,
            amount: amount,
            accountId: accountId,
            expenseTypeId: typeId,
            expenseSubTypeId: null, // Subtypes not implemented here yet
            status: 'pending', // Expense starts as pending payment/reconciliation
            expenseDate: Timestamp.fromDate(new Date(expenseDate)),
            recordedByUid: currentUser.uid, // Logged by the approving admin
            recordedByEmail: currentUser.email,
            linkedRequestId: requestId, // Link back to the original request
            createdAt: Timestamp.now()
        });

        // 2. Update the original request status
        await db.collection('expenseRequests').doc(requestId).update({
            status: 'approved',
            approvedByUid: currentUser.uid,
            approvedByEmail: currentUser.email,
            approvalDate: Timestamp.now(),
            linkedExpenseId: expenseRef.id // Link to the newly created expense
        });

        showToast("Success", "Request approved and expense record created.", "success");
        // Refreshing the list is handled in the calling function (attachAdminListeners)

    } catch (error) {
        console.error("Error finalizing request approval:", error);
        showToast("Error", `Failed to finalize approval: ${error.message}`, "danger");
        throw error; // Re-throw error so the modal submit handler knows it failed
    }
}

// Placeholder function for viewing linked expense (could open a modal)
// function viewExpense(expenseId) {
//     // TODO: Implement logic to fetch and display expense details, maybe in a modal.
//     console.log("Attempting to view expense:", expenseId);
//     showToast("Not Implemented", `Viewing expense ${expenseId} is not yet implemented.`, "info");
// }

// --- Admin Table Action Handler ---
function handleAdminTableActions(event) {
    const button = event.target.closest('button[data-id][data-action]');
    if (!button || userRole !== 'admin') return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    if (!id || !action) return;

    switch (action) {
        case 'edit-account':
            // Populate and show edit account modal
            document.getElementById('edit-account-id').value = id;
            document.getElementById('edit-account-name').value = button.dataset.name || '';
            document.getElementById('edit-account-type').value = button.dataset.type || '';
            document.getElementById('edit-account-owner').value = button.dataset.owner || '';
            document.getElementById('edit-account-notes').value = button.dataset.notes || '';
            editAccountModalInstance?.show();
            break;
        case 'delete-account':
            deleteAccount(id);
            break;
        case 'edit-type':
             // Populate and show edit type modal
            document.getElementById('edit-exp-type-id').value = id;
            document.getElementById('edit-exp-type-name').value = button.dataset.name || '';
            editExpenseTypeModalInstance?.show();
            break;
        case 'delete-type':
            deleteExpenseType(id);
            break;
        default:
            console.warn("Unknown admin table action:", action);
    }
}

// --- Account View Page Logic ---
async function loadAccountViewData(accountId) {
    if (!accountId || userRole !== 'admin') { // Only admins can view this page for now
        showToast("Error", "Invalid account ID or insufficient permissions.", "danger");
        // Optionally redirect back to admin page
        // window.location.href = 'admin.html';
        document.getElementById('account-details').innerHTML = '<p class="text-danger">Access Denied or Invalid Account.</p>';
        document.getElementById('account-income-table-body').innerHTML = '<tr><td colspan="5"></td></tr>'; // Clear tables
        document.getElementById('account-expense-table-body').innerHTML = '<tr><td colspan="5"></td></tr>';
        return;
    }

    // 1. Load Account Details
    try {
        const docSnap = await db.collection('accounts').doc(accountId).get();
        if (docSnap.exists) {
            const account = docSnap.data();
            document.getElementById('account-name-display').textContent = escapeHTML(account.name);
            document.getElementById('account-type-display').textContent = escapeHTML(account.type);
            document.getElementById('account-owner-display').textContent = escapeHTML(account.owner);
            document.getElementById('account-notes-display').textContent = escapeHTML(account.notes) || 'N/A';
        } else {
            showToast("Error", "Account not found.", "danger");
            document.getElementById('account-details').innerHTML = '<p class="text-danger">Account not found.</p>';
        }
    } catch (error) {
        console.error("Error loading account details:", error);
        showToast("Error", "Failed to load account details.", "danger");
        document.getElementById('account-details').innerHTML = '<p class="text-danger">Error loading account details.</p>';
    }

    // 2. Load Associated Income
    loadAccountTransactions(accountId, 'income', 'account-income-table-body');

    // 3. Load Associated Expenses
    loadAccountTransactions(accountId, 'expenses', 'account-expense-table-body');
}

async function loadAccountTransactions(accountId, collectionName, tableBodyId) {
    const tableBody = document.getElementById(tableBodyId);
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Loading ${collectionName}...</td></tr>`;

    try {
        const snapshot = await db.collection(collectionName)
                                 .where('accountId', '==', accountId)
                                 .orderBy(collectionName === 'income' ? 'receivedDate' : 'expenseDate', 'desc')
                                 .limit(50) // Limit results for performance
                                 .get();

        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No ${collectionName} found for this account.</td></tr>`;
            return;
        }

        let rowsHtml = '';
        snapshot.forEach(doc => {
            const item = doc.data();
            const date = formatDate(item.receivedDate || item.expenseDate);
            // Determine the 'type' or 'source' column content
            const typeOrSource = collectionName === 'expenses'
                ? (expenseTypesCache.find(type => type.id === item.expenseTypeId)?.name || 'Unknown')
                : escapeHTML(item.source);

            rowsHtml += `<tr>
                           <td>${date}</td>
                           <td>${escapeHTML(item.description)}</td>
                           <td>${typeOrSource}</td>
                           <td class="text-end">${formatCurrency(item.amount)}</td>
                           <td><span class="badge ${getStatusBadgeClass(item.status)} text-capitalize">${escapeHTML(item.status)}</span></td>
                         </tr>`;
        });
        tableBody.innerHTML = rowsHtml;
    } catch (error) {
        console.error(`Error loading ${collectionName} for account ${accountId}:`, error);
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error loading ${collectionName}.</td></tr>`;
        showToast("Error", `Could not load ${collectionName} for this account.`, "danger");
    }
}


// --- Initial Load Trigger ---
// The onAuthStateChanged listener now handles the primary initialization flow.
// Ensure auth listeners are attached if on login page and not logged in initially.
if (currentPage.includes('login.html') && !auth.currentUser) {
    attachAuthListeners();
}

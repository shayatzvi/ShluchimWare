// Ensure app.js is loaded first and firebase is initialized

// --- Page Specific Globals ---
let assignRolesToastInstance = null; // Separate toast instance if needed, or reuse appToastInstance

// --- Utility Functions (Can be shared/moved from app.js if needed) ---

// Show Bootstrap Toast Notification (Copied from app.js for standalone use if app.js isn't loaded first, but better to rely on app.js)
// Assuming showToast is available globally from app.js

// Helper function to safely escape HTML (Copied from app.js)
// Assuming escapeHTML is available globally from app.js

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // The auth state listener in app.js handles the initial user/role check
    // We just need to wait for the user and role to be available
    waitForUserAndRole().then(() => {
        if (userRole === 'admin') {
            console.log("Admin user confirmed for assign_roles page.");
            initializeAssignRolesPage();
        } else {
            console.warn("Non-admin user attempting to access assign_roles page. Redirecting.");
            showToast("Access Denied", "You must be an admin to access this page.", "danger");
            // Redirect non-admins away
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 2000);
            // Optionally hide content immediately
            const mainContent = document.getElementById('main-content');
            if(mainContent) mainContent.innerHTML = '<div class="alert alert-danger">Access Denied. Redirecting...</div>';
        }
    }).catch(error => {
        console.error("Error waiting for user/role:", error);
         showToast("Initialization Error", "Could not verify user role.", "danger");
         const mainContent = document.getElementById('main-content');
         if(mainContent) mainContent.innerHTML = '<div class="alert alert-danger">Could not initialize page. Please try again later.</div>';
    });
});

// Helper to wait until currentUser and userRole are populated by app.js listener
function waitForUserAndRole(timeout = 5000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            if (currentUser && userRole !== undefined) {
                clearInterval(interval);
                resolve();
            } else if (Date.now() - startTime > timeout) {
                clearInterval(interval);
                reject(new Error("Timeout waiting for user and role information."));
            }
        }, 100); // Check every 100ms
    });
}

function initializeAssignRolesPage() {
    // Detach previous listeners if any? No, loadUsers should handle updates.
    attachRoleAssignmentListeners();
    // loadUsersForRoleAssignment(); // Replace one-time load with listener
    listenForUserRoleChanges(); // Start the realtime listener
}

function attachRoleAssignmentListeners() {
    const tableBody = document.getElementById('users-role-table-body');
    if (tableBody && !tableBody.dataset.listenerAttached) {
        tableBody.addEventListener('click', handleRoleChangeAction);
        // Add listener for clicks within the table body
        tableBody.dataset.listenerAttached = 'true';
        console.log("Assign Roles: Click listener attached to table body.");
    }
}

async function loadUsersForRoleAssignment() {
    const tableBody = document.getElementById('users-role-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Loading users...</td></tr>';

    try {
        // --- Use get() for one-time load ---
        // console.log("Assign Roles: Fetching users from 'roles' collection..."); // Log fetch start
        const snapshot = await db.collection('roles').orderBy('email').get();
        // --- End one-time load ---

        if (snapshot.empty) {
            console.log("Assign Roles: No users found in initial load.");
            tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No users found in roles collection. Users must sign up first.</td></tr>';
            return;
        }

        let html = '';
        console.log(`Assign Roles: Found ${snapshot.size} documents.`); // Log count
        snapshot.forEach(doc => {
            const userData = doc.data();
            const userId = doc.id;
            // --- MODIFIED: Include 'no_access' and handle missing/invalid roles ---
            console.log(`Assign Roles: Processing User ID: ${userId}, Data:`, JSON.stringify(userData)); // Log each user's data
            const validRoles = ['admin', 'basic', 'no_access'];
            const isValidRole = userData.role && validRoles.includes(userData.role);
            const currentRole = isValidRole ? userData.role : 'no_access'; // Default to 'no_access' if missing/invalid
            const displayRole = currentRole || 'Not Assigned'; // Text to display

            // Prevent admin from changing their own role via this interface
            const disableActions = userId === currentUser.uid;
            const disabledAttr = disableActions ? 'disabled' : '';
            const titleAttr = disableActions ? 'title="Cannot change your own role"' : '';

            html += `
             <tr>
                 <td>${escapeHTML(userData.email || 'Email Missing!')}</td>
                 <td>
                    <span class="badge ${
                        currentRole === 'admin' ? 'bg-primary' :
                        (currentRole === 'basic' ? 'bg-secondary' : 'bg-light text-dark border') // Style for 'no_access'
                    } text-capitalize">${escapeHTML(displayRole)}</span>
                 </td>
                 <td>
                     <div class="btn-group btn-group-sm" role="group" ${titleAttr}>
                         <button class="btn btn-outline-secondary ${currentRole === 'basic' ? 'active' : ''}" data-current-role="${currentRole || ''}"
                                 data-id="${userId}" data-action="set-role-basic" ${disabledAttr}>
                             Set Basic
                         </button>
                         <button class="btn btn-outline-primary ${currentRole === 'admin' ? 'active' : ''}" data-current-role="${currentRole || ''}"
                                 data-id="${userId}" data-action="set-role-admin" ${disabledAttr}>
                             Set Admin
                         </button>
                     </div>
                 </td>
             </tr>`;
        });
        tableBody.innerHTML = html;

    } catch (error) {
        console.error("Error loading users table:", error);
        tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Error loading users.</td></tr>';
        showToast("Error", "Could not load users.", "danger");
    }
}

// --- New Function: Listen for Realtime Updates ---
let rolesListenerUnsubscribe = null; // To store the unsubscribe function

function listenForUserRoleChanges() {
    const tableBody = document.getElementById('users-role-table-body');
    if (!tableBody) return;

    console.log("Assign Roles: Setting up realtime listener for 'roles' collection...");
    tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Listening for user updates...</td></tr>';

    // Unsubscribe from previous listener if it exists
    if (rolesListenerUnsubscribe) {
        console.log("Assign Roles: Unsubscribing from previous listener.");
        rolesListenerUnsubscribe();
        rolesListenerUnsubscribe = null;
    }

    rolesListenerUnsubscribe = db.collection('roles')
        .orderBy('email')
        .onSnapshot(snapshot => {
            console.log(`Assign Roles: Snapshot received. ${snapshot.docChanges().length} changes. Total docs: ${snapshot.size}`);
            if (snapshot.empty) {
                tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No users found in roles collection. Users must sign up first.</td></tr>';
                return;
            }

            let html = '';
            snapshot.forEach(doc => {
                const userData = doc.data();
                const userId = doc.id;
                // Use same logic as loadUsersForRoleAssignment
                const validRoles = ['admin', 'basic', 'no_access'];
                const isValidRole = userData.role && validRoles.includes(userData.role);
                const currentRole = isValidRole ? userData.role : 'no_access';
                const displayRole = currentRole || 'Not Assigned';

                const disableActions = userId === currentUser?.uid; // Check currentUser exists
                const disabledAttr = disableActions ? 'disabled' : '';
                const titleAttr = disableActions ? 'title="Cannot change your own role"' : '';

                html += `
                 <tr>
                     <td>${escapeHTML(userData.email || 'Email Missing!')}</td>
                     <td>
                        <span class="badge ${
                            currentRole === 'admin' ? 'bg-primary' :
                            (currentRole === 'basic' ? 'bg-secondary' : 'bg-light text-dark border')
                        } text-capitalize">${escapeHTML(displayRole)}</span>
                     </td>
                     <td>
                         <div class="btn-group btn-group-sm" role="group" ${titleAttr}>
                             <button class="btn btn-outline-secondary ${currentRole === 'basic' ? 'active' : ''}" data-current-role="${currentRole || ''}" data-id="${userId}" data-action="set-role-basic" ${disabledAttr}>Set Basic</button>
                             <button class="btn btn-outline-primary ${currentRole === 'admin' ? 'active' : ''}" data-current-role="${currentRole || ''}" data-id="${userId}" data-action="set-role-admin" ${disabledAttr}>Set Admin</button>
                         </div>
                     </td>
                 </tr>`;
            });
            tableBody.innerHTML = html;

        }, error => {
            console.error("Error listening to roles collection:", error);
            tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Error listening for user updates.</td></tr>';
            showToast("Error", "Could not listen for user updates.", "danger");
        });
}

async function handleRoleChangeAction(event) {
    const button = event.target.closest('button[data-id][data-action]');
    // Rely on userRole being globally available from app.js
    if (!button || userRole !== 'admin') return;

    const userId = button.dataset.id;
    const action = button.dataset.action;

    if (!userId || !action) return;

    let newRole = null;
    if (action === 'set-role-basic') {
        newRole = 'basic';
    } else if (action === 'set-role-admin') {
        newRole = 'admin';
    } else {
        console.warn("Unknown role action:", action);
        return;
    }

    // Disable buttons in the group during update
    const buttonGroup = button.closest('.btn-group');
    buttonGroup?.querySelectorAll('button').forEach(btn => btn.disabled = true);

    console.log(`Attempting to set role for user ${userId} to ${newRole}`);
    try {
        // Use the updateUserRole function potentially defined in app.js or define it here
        // Let's assume it might be needed elsewhere and keep it in app.js for now.
        // We need to ensure app.js defines updateUserRole globally or provides it.
        // For now, let's duplicate the core logic here, assuming app.js might not expose it.

        if (userId === currentUser.uid) {
             showToast("Info", "Cannot change your own role via this interface.", "warning");
             // Re-enable buttons immediately
             buttonGroup?.querySelectorAll('button').forEach(btn => btn.disabled = false);
             return;
        }

        await db.collection('roles').doc(userId).set({ role: newRole, email: button.closest('tr').cells[0].textContent }, { merge: true }); // Merge to update/add role and ensure email is present
        showToast("Success", `User role updated to ${newRole}.`, "success");
        // No need to manually refresh, the onSnapshot listener will handle it automatically.
        // loadUsersForRoleAssignment();
    } catch (error) {
        console.error(`Error updating role for user ${userId}:`, error);
        showToast("Error", `Failed to update user role: ${error.message}`, "danger");
        // Re-enable buttons on error
        buttonGroup?.querySelectorAll('button').forEach(btn => btn.disabled = false);
    }
}

// Note: This file relies on app.js being loaded first to handle:
// 1. Firebase Initialization (firebase, auth, db, Timestamp)
// 2. Auth State Listening (currentUser, userRole population)
// 3. Common UI Initialization (navbar, logout)
// 4. Utility Functions (showToast, escapeHTML)
// 5. Global Variables (currentUser, userRole)
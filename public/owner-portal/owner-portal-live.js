import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = "https://fathkdyxgeeokxeobxqp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdGhrZHl4Z2Vlb2t4ZW9ieHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNTA5NTEsImV4cCI6MjA4NjgyNjk1MX0.bmFK3oSm4-f6Yp3e39l1yDhT29GIkfW4tHXSc-vBXR8";

let activeSpotId = null;
let activeSpotProfile = null;
const activeSpotStorageKey = "cebspot-owner-active-spot-id";
const testCebspotClubSpotId = "66666666-6666-4666-8666-666666666666";

function activateAssignedSpot(spotId) {
  const nextSpotId = spotId ? String(spotId) : "";
  const previousSpotId = window.localStorage.getItem(activeSpotStorageKey) || "";
  activeSpotId = nextSpotId || null;

  if (nextSpotId) window.localStorage.setItem(activeSpotStorageKey, nextSpotId);
  else window.localStorage.removeItem(activeSpotStorageKey);
  window.__setCebspotOwnerSpot?.(nextSpotId);

  if (nextSpotId && previousSpotId !== nextSpotId) {
    window.location.reload();
  }
}

async function loadAssignedSpotProfile() {
  if (!activeSpotId) {
    activeSpotProfile = null;
    return;
  }

  const { data, error } = await supabase
    .from("spots")
    .select("id,name,category,images,table_inventory")
    .eq("id", activeSpotId)
    .maybeSingle();
  if (error) {
    warn("Unable to load assigned venue identity.", error);
    return;
  }
  activeSpotProfile = data || null;
  const inheritedClubTemplate = activeSpotProfile
    && activeSpotProfile.id !== testCebspotClubSpotId
    && ["sunset", "prime", "late"].every(
      (slotId) => Array.isArray(activeSpotProfile.table_inventory?.[slotId])
        && activeSpotProfile.table_inventory[slotId].length === 62,
    );
  if (inheritedClubTemplate) {
    const emptyInventory = { sunset: [], prime: [], late: [] };
    const { error: cleanupError } = await supabase
      .from("spots")
      .update({ table_inventory: emptyInventory, updated_at: new Date().toISOString() })
      .eq("id", activeSpotId);
    if (cleanupError) warn("Unable to remove inherited table template from this venue.", cleanupError);
    else activeSpotProfile.table_inventory = emptyInventory;
    const storageKey = tablesStorageKey();
    if (storageKey) window.localStorage.removeItem(storageKey);
  }
  applyAssignedSpotIdentity();
}

function applyAssignedSpotIdentity() {
  if (!activeSpotProfile) return;

  document.querySelectorAll('img[alt="Test Cebspot Restaurant"], img[alt="Test Cebspot Club"]').forEach((image) => {
    image.alt = activeSpotProfile.name;
    const identityCopy = image.parentElement?.nextElementSibling;
    if (identityCopy?.children?.[0]) identityCopy.children[0].textContent = activeSpotProfile.name;
    if (identityCopy?.children?.[1]) identityCopy.children[1].textContent = activeSpotProfile.category || "Venue";
  });

  document.querySelectorAll("h1,h2,h3,h4,p,span,div").forEach((element) => {
    if (element.children.length) return;
    const text = element.textContent?.trim();
    if (text === "Test Cebspot Restaurant" || text === "Test Cebspot Club") {
      element.textContent = activeSpotProfile.name;
    }
  });
}

function tablesStorageKey() {
  return activeSpotId ? `cebspot-owner-tables-${activeSpotId}` : null;
}

function approvalMarkKey() {
  return activeSpotId ? `cebspot-owner-approval-rpc-${activeSpotId}` : null;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

let reservationChannel = null;
let spotChannel = null;
let syncingTables = false;
let reservationRows = new Map();
let enhanceTimer = null;
let reviewEnhanceTimer = null;
let observerStarted = false;
let renderingEnhancements = false;
let renderingReviewEnhancements = false;

function warn(message, detail) {
  console.warn(`[owner-portal-live] ${message}`, detail ?? "");
}

function hashReservationId(value) {
  return String(value || "")
    .split("")
    .reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) % 10000, 0);
}

function getReservationBookingId(reservation) {
  const id = String(reservation?.id || "");
  const digits = id.replace(/\D/g, "");
  const numericId = digits ? digits.slice(-4) : String(hashReservationId(id));
  return numericId.padStart(4, "0");
}

function getReservationUniqueId(reservation) {
  const qrDigits = String(reservation?.qr_code || "").match(/(\d{8,})$/)?.[1];
  if (qrDigits) return qrDigits;

  const createdAt = Date.parse(reservation?.created_at || "");
  if (!Number.isNaN(createdAt)) return String(Math.floor(createdAt / 1000));

  return String(reservation?.id || "").replace(/-/g, "").slice(-10).toUpperCase();
}

function getReservationDisplayRef(reservation) {
  return `CEBSPOT-${getReservationBookingId(reservation)}-${getReservationUniqueId(reservation)}`;
}

function installReservationEnhancementStyles() {
  if (document.getElementById("ceb-owner-portal-live-styles")) return;

  const style = document.createElement("style");
  style.id = "ceb-owner-portal-live-styles";
  style.textContent = `
    .ceb-payment-details {
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid rgba(226, 232, 240, 0.9);
      display: grid;
      gap: 0.25rem;
      font-size: 0.6875rem;
      line-height: 1.25;
      color: #64748b;
    }

    .ceb-payment-details strong {
      color: #0f172a;
      font-weight: 800;
    }

    .ceb-proof-button,
    .ceb-accept-button,
    .ceb-attendance-button {
      border: 0;
      cursor: pointer;
      font-weight: 800;
      transition: transform 150ms ease, opacity 150ms ease, background-color 150ms ease;
    }

    .ceb-proof-button {
      width: fit-content;
      margin-top: 0.25rem;
      padding: 0.35rem 0.6rem;
      border-radius: 0.75rem;
      background: #fff7ed;
      color: #ea580c;
      font-size: 0.6875rem;
    }

    .ceb-accept-button {
      margin-left: 0.35rem;
      padding: 0.5rem 0.85rem;
      border-radius: 0.9rem;
      background: #16a34a;
      color: #ffffff;
      font-size: 0.75rem;
      box-shadow: 0 8px 18px rgba(22, 163, 74, 0.18);
    }

    .ceb-attendance-button {
      margin-left: 0.35rem;
      padding: 0.5rem 0.85rem;
      border-radius: 0.9rem;
      font-size: 0.75rem;
    }

    .ceb-arrived-button {
      background: #16a34a;
      color: #ffffff;
    }

    .ceb-no-show-button {
      border: 1px solid #fecdd3;
      background: #fff1f2;
      color: #be123c;
    }

    .ceb-proof-button:hover,
    .ceb-accept-button:hover,
    .ceb-attendance-button:hover {
      transform: translateY(-1px);
    }

    .ceb-accept-button:disabled,
    .ceb-attendance-button:disabled {
      cursor: default;
      transform: none;
      opacity: 0.65;
      background: #94a3b8;
      box-shadow: none;
    }

    .ceb-payment-panel {
      margin: 1rem 0 1.25rem;
      padding: 1.25rem;
      border: 1px solid rgba(226, 232, 240, 0.95);
      border-radius: 1.5rem;
      background: #ffffff;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.04);
    }

    .ceb-payment-panel h3 {
      margin: 0;
      color: #0f172a;
      font-size: 1rem;
      font-weight: 900;
    }

    .ceb-payment-panel p {
      margin: 0.25rem 0 0;
      color: #64748b;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .ceb-payment-list {
      display: grid;
      gap: 0.75rem;
      margin-top: 1rem;
    }

    .ceb-payment-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 1rem;
      align-items: center;
      padding: 1rem;
      border: 1px solid #f1f5f9;
      border-radius: 1.1rem;
      background: #f8fafc;
    }

    .ceb-payment-card-title {
      color: #0f172a;
      font-size: 0.85rem;
      font-weight: 900;
    }

    .ceb-payment-card-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.65rem;
      margin-top: 0.65rem;
    }

    .ceb-payment-field {
      min-width: 0;
      padding: 0.65rem;
      border-radius: 0.85rem;
      background: #ffffff;
      border: 1px solid #eef2f7;
    }

    .ceb-payment-field span {
      display: block;
      color: #94a3b8;
      font-size: 0.62rem;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .ceb-payment-field strong {
      display: block;
      margin-top: 0.25rem;
      overflow-wrap: anywhere;
      color: #0f172a;
      font-size: 0.8rem;
      font-weight: 900;
    }

    .ceb-payment-card-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 0.5rem;
    }

    .ceb-empty-payment-state {
      margin-top: 1rem;
      padding: 1rem;
      border-radius: 1rem;
      background: #f8fafc;
      color: #64748b;
      font-size: 0.8rem;
      font-weight: 700;
    }

    .ceb-owner-review-tools {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #f1f5f9;
    }

    .ceb-owner-review-replies {
      display: grid;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .ceb-owner-review-reply {
      padding: 0.7rem 0.8rem;
      border-left: 3px solid #f57c00;
      border-radius: 0.75rem;
      background: #f8fafc;
      color: #334155;
      font-size: 0.75rem;
      line-height: 1.45;
    }

    .ceb-owner-review-reply strong {
      display: block;
      margin-bottom: 0.2rem;
      color: #9a4b00;
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .ceb-owner-review-composer {
      display: flex;
      gap: 0.6rem;
      align-items: flex-end;
    }

    .ceb-owner-review-composer textarea {
      flex: 1;
      min-height: 2.8rem;
      max-height: 8rem;
      resize: vertical;
      padding: 0.7rem 0.8rem;
      border: 1px solid #e2e8f0;
      border-radius: 0.8rem;
      background: #f8fafc;
      color: #0f172a;
      font: inherit;
      font-size: 0.78rem;
    }

    .ceb-owner-review-send {
      min-height: 2.8rem;
      padding: 0 1rem;
      border: 0;
      border-radius: 0.8rem;
      background: #f57c00;
      color: white;
      cursor: pointer;
      font-size: 0.72rem;
      font-weight: 900;
      text-transform: uppercase;
    }

    @media (max-width: 900px) {
      .ceb-payment-card {
        grid-template-columns: 1fr;
      }

      .ceb-payment-card-grid {
        grid-template-columns: 1fr;
      }

      .ceb-payment-card-actions {
        justify-content: flex-start;
      }
    }
  `;
  document.head.appendChild(style);
}

function readTables() {
  try {
    const storageKey = tablesStorageKey();
    if (!storageKey) return [];
    const stored = window.localStorage.getItem(storageKey);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    warn("Unable to read portal tables.", error);
    return [];
  }
}

function slotForTable(table, index) {
  const text = `${table.id || ""} ${table.name || ""}`.toLowerCase();
  if (text.includes("prime")) return "prime";
  if (text.includes("late")) return "late";
  if (text.includes("sunset")) return "sunset";
  return ["sunset", "prime", "late"][index % 3];
}

function tableInventoryFromPortalTables(tables) {
  const inventory = { sunset: [], prime: [], late: [] };

  tables.forEach((table, index) => {
    const slot = slotForTable(table, index);
    inventory[slot].push({
      tableId: String(table.id || `table-${index + 1}`),
      capacity: Number(table.capacity || 2),
      isReserved: table.isActive === false || String(table.status || "").toLowerCase().includes("reserved"),
    });
  });

  return inventory;
}

function reservationFeeFromPortalTables(tables) {
  const values = tables.map((table) => Number(table.dpAmount)).filter((value) => Number.isFinite(value) && value >= 0);
  return values.length ? values[0] : null;
}

async function requireOwnerSession() {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;

  if (!user) {
    activateAssignedSpot(null);
    return null;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,email,role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    warn("Unable to verify owner profile.", error);
    return null;
  }

  const isOwner = profile?.role === "owner";

  if (!isOwner) {
    warn("Signing out non-owner account from owner portal.", profile?.email || user.email);
    await supabase.auth.signOut();
    activateAssignedSpot(null);
    return null;
  }

  const { data: accessRows, error: accessError } = await supabase
    .from("owner_spot_access")
    .select("spot_id,role,created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });
  if (accessError) {
    warn("Unable to load this business account's assigned spot.", accessError);
    return null;
  }

  const primaryAccess = (accessRows || []).find((access) => access.role === "owner") || accessRows?.[0];
  if (primaryAccess?.spot_id) {
    activeSpotId = primaryAccess.spot_id;
    activateAssignedSpot(activeSpotId);
    return user;
  }

  const { data: ownedSpot, error: ownedSpotError } = await supabase
    .from("spots")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (ownedSpotError) {
    warn("Unable to load this business account's venue.", ownedSpotError);
    return null;
  }
  activateAssignedSpot(ownedSpot?.id || null);
  if (!activeSpotId) {
    warn("This owner account is not assigned to a venue.");
    return null;
  }

  return user;
}

function bookingRefsForReservation(reservation) {
  const refs = new Set();

  if (reservation?.id) {
    const id = String(reservation.id).trim();
    refs.add(id);
    refs.add(`CEB-${id.slice(0, 8).toUpperCase()}`);
  }

  refs.add(getReservationDisplayRef(reservation));

  if (reservation?.qr_code) {
    refs.add(String(reservation.qr_code).trim());
  }

  return [...refs].filter(Boolean);
}

function rememberReservation(reservation) {
  if (!reservation?.id) return;

  for (const ref of bookingRefsForReservation(reservation)) {
    reservationRows.set(ref, reservation);
  }
}

async function loadReservationRows() {
  const user = await requireOwnerSession();
  if (!user || !activeSpotId) return;

  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("spot_id", activeSpotId)
    .order("created_at", { ascending: false });

  if (error) {
    warn("Unable to load reservation payment details.", error);
    return;
  }

  reservationRows = new Map();
  for (const reservation of data || []) {
    rememberReservation(reservation);
  }
}

function isFullUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

async function getPaymentProofUrl(paymentProofPath) {
  if (!paymentProofPath) return null;
  if (isFullUrl(paymentProofPath)) return paymentProofPath;

  const { data, error } = await supabase.storage.from("payment-proofs").createSignedUrl(paymentProofPath, 300);
  if (error) {
    warn("Unable to create payment proof link.", error);
    return null;
  }

  return data?.signedUrl || null;
}

async function openPaymentProof(reservationId) {
  if (!reservationRows.has(reservationId)) {
    await loadReservationRows();
  }

  const reservation = reservationRows.get(reservationId);
  const url = await getPaymentProofUrl(reservation?.payment_proof_url);

  if (!url) {
    window.alert("No payment proof screenshot was found for this reservation.");
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

async function approveReservation(reservationId) {
  if (!reservationId) return;

  try {
    const { data, error } = await supabase.rpc("approve_paid_reservation", {
      reservation_id: reservationId,
    });

    if (error) throw error;

    if (data) {
      const reservation = Array.isArray(data) ? data[0] : data;
      rememberReservation(reservation);
    }

    await loadReservationRows();
    queueEnhanceReservationsPage();
  } catch (error) {
    warn("Unable to approve reservation. Run the latest supabase-schema.sql if this RPC is missing.", error);
    window.alert(error?.message || "Unable to approve this reservation.");
  }
}

function canRecordAttendance(reservation) {
  const status = String(reservation?.status || "").toLowerCase();
  if (["cancelled", "checked_in", "completed", "no_show"].includes(status)) return false;
  if (reservation?.payment_required && reservation?.payment_status !== "paid") return false;
  return ["pending", "confirmed", "rescheduled"].includes(status);
}

async function recordReservationAttendance(reservationId, attendanceStatus) {
  const reservation = reservationRows.get(reservationId);
  if (!reservation || !canRecordAttendance(reservation)) return;

  const isNoShow = attendanceStatus === "no_show";
  const prompt = isNoShow
    ? "Mark this guest as a no-show? Their table will be released immediately for the next reservation."
    : "Confirm that this guest has arrived? Their table will remain occupied.";
  if (!window.confirm(prompt)) return;

  try {
    const { data, error } = await supabase.rpc("owner_record_reservation_attendance", {
      reservation_id: reservationId,
      attendance_status: attendanceStatus,
    });
    if (error) throw error;

    const updated = Array.isArray(data) ? data[0] : data;
    if (updated) rememberReservation(updated);
    await loadReservationRows();
    queueEnhanceReservationsPage();
  } catch (error) {
    warn("Unable to update reservation attendance. Run supabase-reservation-attendance.sql if this RPC is missing.", error);
    window.alert(error?.message || "Unable to update reservation attendance.");
  }
}

function textLine(label, value) {
  const line = document.createElement("div");
  const labelEl = document.createElement("strong");
  const valueEl = document.createElement("span");

  labelEl.textContent = `${label}: `;
  valueEl.textContent = value || "Not sent";

  line.append(labelEl, valueEl);
  return line;
}

function hasPaymentDetails(reservation) {
  return Boolean(
    reservation?.payment_required ||
      reservation?.payment_reference ||
      reservation?.payer_gcash_number ||
      reservation?.payment_proof_url ||
      reservation?.payment_method,
  );
}

function buildPaymentDetails(reservation) {
  const details = document.createElement("div");
  details.className = "ceb-payment-details";

  details.append(
    textLine("Guest", reservation.guest_name),
    textLine("Email", reservation.guest_email),
    textLine("Phone", reservation.guest_phone || reservation.payer_gcash_number),
    textLine("Deposit terms", reservation.payment_terms_accepted ? "Accepted" : "Not recorded"),
    textLine("Reference", reservation.payment_reference),
    textLine("GCash", reservation.payer_gcash_number),
    textLine("Method", reservation.payment_method),
  );

  if (reservation.payment_proof_url) {
    const proofButton = document.createElement("button");
    proofButton.type = "button";
    proofButton.className = "ceb-proof-button";
    proofButton.dataset.cebProofReservation = reservation.id;
    proofButton.textContent = "View proof";
    details.append(proofButton);
  } else {
    details.append(textLine("Proof", ""));
  }

  return details;
}

function findReservationsTable() {
  return [...document.querySelectorAll("table")].find((table) => {
    const headers = [...table.querySelectorAll("th")].map((header) => header.textContent?.trim().toLowerCase() || "");
    return headers.includes("booking ref") && headers.includes("actions");
  });
}

function columnIndex(table, fallbackIndex, label) {
  const headers = [...table.querySelectorAll("th")].map((header) => header.textContent?.trim().toLowerCase() || "");
  const index = headers.findIndex((header) => header === label.toLowerCase());
  return index >= 0 ? index : fallbackIndex;
}

function reservationFromTableRow(row) {
  const bookingRef = row.querySelector("td")?.textContent?.trim();
  return bookingRef ? reservationRows.get(bookingRef) : null;
}

function uniqueReservations() {
  const byId = new Map();

  for (const reservation of reservationRows.values()) {
    if (reservation?.id) {
      byId.set(reservation.id, reservation);
    }
  }

  return [...byId.values()].sort((a, b) => {
    const bTime = Date.parse(b.created_at || b.updated_at || "") || 0;
    const aTime = Date.parse(a.created_at || a.updated_at || "") || 0;
    return bTime - aTime;
  });
}

function appendPaymentField(container, label, value) {
  const field = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");

  field.className = "ceb-payment-field";
  labelEl.textContent = label;
  valueEl.textContent = value || "Not sent";

  field.append(labelEl, valueEl);
  container.append(field);
}

function buildPaymentCard(reservation) {
  const card = document.createElement("div");
  const content = document.createElement("div");
  const title = document.createElement("div");
  const grid = document.createElement("div");
  const actions = document.createElement("div");
  const proofButton = document.createElement("button");
  const acceptButton = document.createElement("button");
  const status = String(reservation.status || "").toLowerCase();
  const isApproved = status === "confirmed";
  const isClosed = ["confirmed", "completed", "cancelled", "no_show"].includes(status);
  const bookingRef = getReservationDisplayRef(reservation);

  card.className = "ceb-payment-card";
  title.className = "ceb-payment-card-title";
  title.textContent = `${bookingRef} - ${reservation.spot_name || "Reservation"}`;
  grid.className = "ceb-payment-card-grid";
  actions.className = "ceb-payment-card-actions";

  appendPaymentField(grid, "Guest", reservation.guest_name);
  appendPaymentField(grid, "Email", reservation.guest_email);
  appendPaymentField(grid, "Phone", reservation.guest_phone || reservation.payer_gcash_number);
  appendPaymentField(grid, "Deposit terms", reservation.payment_terms_accepted ? "Accepted" : "Not recorded");
  appendPaymentField(grid, "GCash number", reservation.payer_gcash_number);
  appendPaymentField(grid, "Reference number", reservation.payment_reference);
  appendPaymentField(grid, "Payment method", reservation.payment_method);

  content.append(title, grid);

  proofButton.type = "button";
  proofButton.className = "ceb-proof-button";
  proofButton.dataset.cebProofReservation = reservation.id;
  proofButton.textContent = reservation.payment_proof_url ? "View screenshot" : "No screenshot";
  proofButton.disabled = !reservation.payment_proof_url;

  acceptButton.type = "button";
  acceptButton.className = "ceb-accept-button";
  acceptButton.dataset.cebAcceptReservation = reservation.id;
  acceptButton.disabled = isClosed;
  acceptButton.textContent = isApproved ? "Approved" : "Accept";

  actions.append(proofButton, acceptButton);
  card.append(content, actions);

  return card;
}

function renderPaymentVerificationPanel(table) {
  const existing = document.querySelector(".ceb-payment-panel");
  const reservations = uniqueReservations();
  const paymentReservations = reservations.filter((reservation) => hasPaymentDetails(reservation));
  const panel = document.createElement("section");
  const title = document.createElement("h3");
  const description = document.createElement("p");

  existing?.remove();

  panel.className = "ceb-payment-panel";
  title.textContent = "Payment verification";
  description.textContent =
    "Submitted GCash number, reference number, and screenshot are shown here before you accept the reservation.";

  panel.append(title, description);

  if (!paymentReservations.length) {
    const empty = document.createElement("div");
    empty.className = "ceb-empty-payment-state";
    empty.textContent =
      reservations.length === 0
        ? "No reservations have loaded yet."
        : "No submitted payment details were found for the loaded reservations.";
    panel.append(empty);
  } else {
    const list = document.createElement("div");
    list.className = "ceb-payment-list";
    paymentReservations.forEach((reservation) => list.append(buildPaymentCard(reservation)));
    panel.append(list);
  }

  const anchor = table.closest("section, div") || table;
  anchor.parentNode?.insertBefore(panel, anchor);
}

function enhanceReservationRow(table, row) {
  const cells = [...row.querySelectorAll("td")];
  if (!cells.length) return;

  const reservation = reservationFromTableRow(row);
  if (!reservation?.id) return;

  const bookingRefCell = cells[columnIndex(table, 0, "Booking Ref")] || cells[0];
  const bookingRef = getReservationDisplayRef(reservation);
  const signature = [
    reservation.id,
    reservation.status,
    reservation.payment_status,
    reservation.payment_reference,
    reservation.payer_gcash_number,
    reservation.guest_phone,
    reservation.payment_terms_accepted,
    reservation.payment_proof_url,
    bookingRef,
  ].join("|");

  if (row.dataset.cebReservationEnhanced === signature) return;

  row.dataset.cebReservationEnhanced = signature;

  const dpPaidCell = cells[columnIndex(table, 5, "DP Paid")] || cells[5];
  const actionsCell = cells[columnIndex(table, cells.length - 1, "Actions")] || cells[cells.length - 1];

  if (bookingRefCell && bookingRefCell.textContent?.trim() !== bookingRef) {
    bookingRefCell.textContent = bookingRef;
  }

  dpPaidCell?.querySelector(".ceb-payment-details")?.remove();
  actionsCell?.querySelector(".ceb-accept-button")?.remove();
  actionsCell?.querySelectorAll(".ceb-attendance-button").forEach((button) => button.remove());

  if (dpPaidCell && hasPaymentDetails(reservation)) {
    dpPaidCell.append(buildPaymentDetails(reservation));
  }

  if (!actionsCell) return;

  const status = String(reservation.status || "").toLowerCase();
  const isApproved = status === "confirmed";
  const isClosed = ["confirmed", "completed", "cancelled", "no_show"].includes(status);
  const acceptButton = document.createElement("button");
  acceptButton.type = "button";
  acceptButton.className = "ceb-accept-button";
  acceptButton.dataset.cebAcceptReservation = reservation.id;
  acceptButton.disabled = isClosed;
  acceptButton.textContent = isApproved ? "Approved" : "Accept";

  actionsCell.append(acceptButton);

  if (canRecordAttendance(reservation)) {
    const arrivedButton = document.createElement("button");
    arrivedButton.type = "button";
    arrivedButton.className = "ceb-attendance-button ceb-arrived-button";
    arrivedButton.dataset.cebAttendanceReservation = reservation.id;
    arrivedButton.dataset.cebAttendanceStatus = "checked_in";
    arrivedButton.textContent = "Guest Arrived";

    const noShowButton = document.createElement("button");
    noShowButton.type = "button";
    noShowButton.className = "ceb-attendance-button ceb-no-show-button";
    noShowButton.dataset.cebAttendanceReservation = reservation.id;
    noShowButton.dataset.cebAttendanceStatus = "no_show";
    noShowButton.textContent = "No Show";

    actionsCell.append(arrivedButton, noShowButton);
  }
}

function enhanceReservationsPage() {
  installReservationEnhancementStyles();

  const table = findReservationsTable();
  if (!table) return;

  renderingEnhancements = true;
  try {
    document.querySelector(".ceb-payment-panel")?.remove();

    table.querySelectorAll("tbody tr").forEach((row) => {
      enhanceReservationRow(table, row);
    });
  } finally {
    window.setTimeout(() => {
      renderingEnhancements = false;
    }, 0);
  }
}

function queueEnhanceReservationsPage() {
  window.clearTimeout(enhanceTimer);
  enhanceTimer = window.setTimeout(enhanceReservationsPage, 80);
}

async function enhanceReviewsPage() {
  if (renderingReviewEnhancements || !activeSpotId) return;
  const heading = [...document.querySelectorAll("h1,h2,h3")].find(
    (element) => element.textContent?.trim() === "Guest Reviews",
  );
  if (!heading) return;

  const reviewRoot = heading.closest("div.space-y-10") || heading.parentElement?.parentElement;
  const cards = reviewRoot ? [...reviewRoot.querySelectorAll("article")] : [];
  if (!cards.length || cards.every((card) => card.querySelector(".ceb-owner-review-tools"))) return;

  renderingReviewEnhancements = true;
  try {
    const [{ data: reviews, error: reviewsError }, { data: replies, error: repliesError }, { data: sessionData }] = await Promise.all([
      supabase.from("reviews").select("id").eq("spot_id", activeSpotId).order("created_at", { ascending: false }),
      supabase.from("review_replies").select("id,review_id,user_id,user_name,body,created_at").eq("spot_id", activeSpotId).order("created_at", { ascending: true }),
      supabase.auth.getSession(),
    ]);
    if (reviewsError) throw reviewsError;
    if (repliesError) throw repliesError;

    const ownerId = sessionData.session?.user?.id;
    cards.forEach((card, index) => {
      const review = reviews?.[index];
      if (!review || card.querySelector(".ceb-owner-review-tools")) return;
      const tools = document.createElement("div");
      tools.className = "ceb-owner-review-tools";
      tools.dataset.cebReviewId = review.id;

      const reviewReplies = (replies || []).filter((reply) => reply.review_id === review.id);
      if (reviewReplies.length) {
        const list = document.createElement("div");
        list.className = "ceb-owner-review-replies";
        reviewReplies.forEach((reply) => {
          const item = document.createElement("div");
          item.className = "ceb-owner-review-reply";
          const author = document.createElement("strong");
          author.textContent = reply.user_id === ownerId ? "Owner reply" : reply.user_name || "CebSpot user";
          const body = document.createElement("span");
          body.textContent = reply.body;
          item.append(author, body);
          list.append(item);
        });
        tools.append(list);
      }

      const composer = document.createElement("div");
      composer.className = "ceb-owner-review-composer";
      const input = document.createElement("textarea");
      input.maxLength = 500;
      input.placeholder = "Reply as the spot owner";
      input.setAttribute("aria-label", "Reply to this guest review");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ceb-owner-review-send";
      button.dataset.cebOwnerReviewReply = review.id;
      button.textContent = "Reply";
      composer.append(input, button);
      tools.append(composer);
      card.append(tools);
    });
  } catch (error) {
    warn("Unable to load owner review replies.", error);
  } finally {
    renderingReviewEnhancements = false;
  }
}

function queueEnhanceReviewsPage() {
  window.clearTimeout(reviewEnhanceTimer);
  reviewEnhanceTimer = window.setTimeout(enhanceReviewsPage, 120);
}

function startReservationsDomObserver() {
  if (observerStarted) return;
  observerStarted = true;

  const observer = new MutationObserver(() => {
    if (renderingEnhancements) return;
    applyAssignedSpotIdentity();
    queueEnhanceReservationsPage();
    queueEnhanceReviewsPage();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

async function syncTablesToSpot() {
  if (syncingTables) return;

  const user = await requireOwnerSession();
  if (!user || !activeSpotId) return;

  const tables = readTables();
  if (!tables.length) return;

  syncingTables = true;
  try {
    const inventory = tableInventoryFromPortalTables(tables);
    const fee = reservationFeeFromPortalTables(tables);
    const payload = {
      table_inventory: inventory,
      is_reservable: true,
      updated_at: new Date().toISOString(),
    };

    if (fee !== null) {
      payload.reservation_fee = fee;
      payload.gcash_amount = fee;
      payload.payment_required = fee > 0;
      payload.reservation_type = fee > 0 ? "paid" : "free";
    }

    const { error } = await supabase.from("spots").update(payload).eq("id", activeSpotId);
    if (error) throw error;
  } catch (error) {
    warn("Unable to sync tables and pricing.", error);
  } finally {
    syncingTables = false;
  }
}

function getApprovedReservationMarks() {
  try {
    const storageKey = approvalMarkKey();
    if (!storageKey) return new Set();
    return new Set(JSON.parse(window.sessionStorage.getItem(storageKey) || "[]"));
  } catch {
    return new Set();
  }
}

function markApprovalAttempt(reservationId) {
  const marks = getApprovedReservationMarks();
  marks.add(reservationId);
  const storageKey = approvalMarkKey();
  if (storageKey) window.sessionStorage.setItem(storageKey, JSON.stringify([...marks]));
}

async function activityAlreadyExists(reservationId) {
  const { data, error } = await supabase
    .from("activities")
    .select("id")
    .eq("target_id", reservationId)
    .eq("type", "reservation_approved")
    .limit(1);

  if (error) {
    warn("Unable to check approval activity.", error);
    return false;
  }

  return Boolean(data?.length);
}

async function ensureApprovalNotification(reservation) {
  if (!reservation?.id || !activeSpotId || reservation.spot_id !== activeSpotId) return;
  if (reservation.status !== "confirmed" && reservation.payment_status !== "paid") return;

  const marks = getApprovedReservationMarks();
  if (marks.has(reservation.id)) return;
  markApprovalAttempt(reservation.id);

  window.setTimeout(async () => {
    try {
      if (await activityAlreadyExists(reservation.id)) return;

      const { error } = await supabase.rpc("approve_paid_reservation", {
        reservation_id: reservation.id,
      });

      if (error) {
        warn("Approval RPC failed. Run the latest supabase-schema.sql if user notifications are missing.", error);
      }
    } catch (error) {
      warn("Unable to create approval notification.", error);
    }
  }, 900);
}

async function scanRecentApprovals() {
  const user = await requireOwnerSession();
  if (!user || !activeSpotId) return;

  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("spot_id", activeSpotId)
    .order("updated_at", { ascending: false })
    .limit(8);

  if (error) {
    warn("Unable to scan recent approvals.", error);
    return;
  }

  for (const reservation of data || []) {
    await ensureApprovalNotification(reservation);
  }
}

function setupRealtime() {
  if (reservationChannel || spotChannel || !activeSpotId) return;

  reservationChannel = supabase
    .channel("owner-portal-live-reservations")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "reservations", filter: `spot_id=eq.${activeSpotId}` },
      (payload) => {
        rememberReservation(payload.new);
        queueEnhanceReservationsPage();
        ensureApprovalNotification(payload.new);
      },
    )
    .subscribe();

  spotChannel = supabase
    .channel("owner-portal-live-spot")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "spots", filter: `id=eq.${activeSpotId}` },
      () => undefined,
    )
    .subscribe();
}

function wireDomEvents() {
  document.addEventListener(
    "click",
    (event) => {
      const button = event.target?.closest?.("button");
      const text = button?.textContent?.trim() || "";
      if (button?.dataset.cebAcceptReservation) {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        button.textContent = "Accepting...";
        approveReservation(button.dataset.cebAcceptReservation);
        return;
      }
      if (button?.dataset.cebAttendanceReservation && button?.dataset.cebAttendanceStatus) {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        recordReservationAttendance(
          button.dataset.cebAttendanceReservation,
          button.dataset.cebAttendanceStatus,
        );
        return;
      }
      if (button?.dataset.cebProofReservation) {
        event.preventDefault();
        event.stopPropagation();
        openPaymentProof(button.dataset.cebProofReservation);
        return;
      }
      if (button?.dataset.cebOwnerReviewReply) {
        event.preventDefault();
        event.stopPropagation();
        const tools = button.closest(".ceb-owner-review-tools");
        const input = tools?.querySelector("textarea");
        const body = input?.value.trim() || "";
        if (!body || !activeSpotId) return;
        button.disabled = true;
        button.textContent = "Sending...";
        supabase.rpc("add_review_reply", {
          target_review_id: button.dataset.cebOwnerReviewReply,
          target_spot_id: activeSpotId,
          reply_body: body,
          parent_reply_id: null,
        }).then(({ error }) => {
          if (error) throw error;
          reviewRootCleanup();
          queueEnhanceReviewsPage();
        }).catch((error) => {
          warn("Unable to send owner review reply.", error);
          window.alert(error?.message || "The reply could not be sent.");
        }).finally(() => {
          button.disabled = false;
          button.textContent = "Reply";
        });
        return;
      }
      if (/confirm payment/i.test(text)) {
        window.setTimeout(async () => {
          await loadReservationRows();
          await scanRecentApprovals();
          queueEnhanceReservationsPage();
        }, 1400);
      }
      if (/create table|save changes|save version/i.test(text)) {
        window.setTimeout(syncTablesToSpot, 700);
      }
    },
    true,
  );

  window.addEventListener("cebspot-owner-tables-updated", () => {
    window.setTimeout(syncTablesToSpot, 250);
  });

  window.addEventListener("storage", (event) => {
    if (event.key === tablesStorageKey()) {
      window.setTimeout(syncTablesToSpot, 250);
    }
  });
}

function reviewRootCleanup() {
  document.querySelectorAll(".ceb-owner-review-tools").forEach((element) => element.remove());
}

async function boot() {
  installReservationEnhancementStyles();
  wireDomEvents();
  startReservationsDomObserver();
  await requireOwnerSession();
  await loadAssignedSpotProfile();
  await loadReservationRows();
  queueEnhanceReservationsPage();
  queueEnhanceReviewsPage();
  await scanRecentApprovals();
  setupRealtime();

  supabase.auth.onAuthStateChange(async () => {
    if (reservationChannel) await supabase.removeChannel(reservationChannel);
    if (spotChannel) await supabase.removeChannel(spotChannel);
    reservationChannel = null;
    spotChannel = null;
    activeSpotId = null;
    await requireOwnerSession();
    await loadAssignedSpotProfile();
    await loadReservationRows();
    queueEnhanceReservationsPage();
    reviewRootCleanup();
    queueEnhanceReviewsPage();
    await scanRecentApprovals();
  });
}

boot();

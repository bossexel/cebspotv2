import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = "https://fathkdyxgeeokxeobxqp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdGhrZHl4Z2Vlb2t4ZW9ieHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNTA5NTEsImV4cCI6MjA4NjgyNjk1MX0.bmFK3oSm4-f6Yp3e39l1yDhT29GIkfW4tHXSc-vBXR8";

const TEST_SPOT_ID = "66666666-6666-4666-8666-666666666666";
const OWNER_EMAIL = "testowner@cebspot.com";
const TABLES_STORAGE_KEY = `cebspot-owner-tables-${TEST_SPOT_ID}`;
const APPROVAL_MARK_KEY = `cebspot-owner-approval-rpc-${TEST_SPOT_ID}`;

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
let observerStarted = false;
let renderingEnhancements = false;

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
    .ceb-accept-button {
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

    .ceb-proof-button:hover,
    .ceb-accept-button:hover {
      transform: translateY(-1px);
    }

    .ceb-accept-button:disabled {
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
    const stored = window.localStorage.getItem(TABLES_STORAGE_KEY);
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

  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,email,role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    warn("Unable to verify owner profile.", error);
    return null;
  }

  const isOwner = profile?.role === "owner" && String(profile.email || "").toLowerCase() === OWNER_EMAIL;

  if (!isOwner) {
    warn("Signing out non-owner account from owner portal.", profile?.email || user.email);
    await supabase.auth.signOut();
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
  if (!user) return;

  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("spot_id", TEST_SPOT_ID)
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
    reservation.payment_proof_url,
    bookingRef,
  ].join("|");

  if (row.dataset.cebReservationEnhanced === signature && row.querySelector(".ceb-accept-button")) return;

  row.dataset.cebReservationEnhanced = signature;

  const dpPaidCell = cells[columnIndex(table, 5, "DP Paid")] || cells[5];
  const actionsCell = cells[columnIndex(table, cells.length - 1, "Actions")] || cells[cells.length - 1];

  if (bookingRefCell && bookingRefCell.textContent?.trim() !== bookingRef) {
    bookingRefCell.textContent = bookingRef;
  }

  dpPaidCell?.querySelector(".ceb-payment-details")?.remove();
  actionsCell?.querySelector(".ceb-accept-button")?.remove();

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

function startReservationsDomObserver() {
  if (observerStarted) return;
  observerStarted = true;

  const observer = new MutationObserver(() => {
    if (renderingEnhancements) return;
    queueEnhanceReservationsPage();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

async function claimOwnerAccess() {
  const user = await requireOwnerSession();
  if (!user) return;

  const { error } = await supabase.rpc("claim_test_cebspot_owner_access");
  if (error) {
    warn("Unable to claim Test Cebspot owner access. Run the latest schema if ownership is wrong.", error);
  }
}

async function syncTablesToSpot() {
  if (syncingTables) return;

  const user = await requireOwnerSession();
  if (!user) return;

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

    const { error } = await supabase.from("spots").update(payload).eq("id", TEST_SPOT_ID);
    if (error) throw error;
  } catch (error) {
    warn("Unable to sync tables and pricing.", error);
  } finally {
    syncingTables = false;
  }
}

function getApprovedReservationMarks() {
  try {
    return new Set(JSON.parse(window.sessionStorage.getItem(APPROVAL_MARK_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function markApprovalAttempt(reservationId) {
  const marks = getApprovedReservationMarks();
  marks.add(reservationId);
  window.sessionStorage.setItem(APPROVAL_MARK_KEY, JSON.stringify([...marks]));
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
  if (!reservation?.id || reservation.spot_id !== TEST_SPOT_ID) return;
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
  if (!user) return;

  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("spot_id", TEST_SPOT_ID)
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
  if (reservationChannel || spotChannel) return;

  reservationChannel = supabase
    .channel("owner-portal-live-reservations")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "reservations", filter: `spot_id=eq.${TEST_SPOT_ID}` },
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
      { event: "*", schema: "public", table: "spots", filter: `id=eq.${TEST_SPOT_ID}` },
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
      if (button?.dataset.cebProofReservation) {
        event.preventDefault();
        event.stopPropagation();
        openPaymentProof(button.dataset.cebProofReservation);
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
    if (event.key === TABLES_STORAGE_KEY) {
      window.setTimeout(syncTablesToSpot, 250);
    }
  });
}

async function boot() {
  installReservationEnhancementStyles();
  wireDomEvents();
  startReservationsDomObserver();
  await claimOwnerAccess();
  await syncTablesToSpot();
  await loadReservationRows();
  queueEnhanceReservationsPage();
  await scanRecentApprovals();
  setupRealtime();

  supabase.auth.onAuthStateChange(async () => {
    await claimOwnerAccess();
    await syncTablesToSpot();
    await loadReservationRows();
    queueEnhanceReservationsPage();
    await scanRecentApprovals();
  });
}

boot();

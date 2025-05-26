// src/lib/cache.ts

interface CacheEntry<T, P = any> {
  // P is the type for parameters
  data: T | null;
  lastFetchTime: number | null;
  lastFetchParams?: P; // Parameters used for the last fetch
}

// Define specific keys for type safety and to avoid conflicts
export type CacheKey =
  | "services_ManageServices"
  | "branches_ManageServices" // For ManageServices component
  | "serviceSets_ManageServiceSets"
  | "availableServices_ManageServiceSets" // For Service Set modal
  | "accounts_ManageAccounts"
  | "branches_ManageAccounts" // For ManageAccounts component
  | "transactions_ManageTransactions"
  | "vouchers_ManageVouchers"
  | "payslips_ManagePayslips"
  | "accounts_ManagePayslips" // For employee list in ManagePayslips
  | "requests_ManagePayslips" // For payslip requests in ManagePayslips
  // --- Existing New Keys ---
  | "branches_ManageGiftCertificates" // Branches for GC form
  | "items_ManageGiftCertificates" // Services/Sets for GC form
  | "activeGCs_ManageGiftCertificates" // List of active GCs
  | "services_ManageDiscounts" // Services for Discount form
  | "discountRules_ManageDiscounts" // List of discount rules
  | "branches_ManageBranches" // List of branches in ManageBranches
  | "customers_SendEmail" // For the customer list in SendEmailToCustomers component
  | "emailTemplates_ManageEmailTemplates" // For the list of email templates
  // --- ADD THIS NEW KEY ---
  | "customers_ManageCustomers"; // For the list of customers in ManageCustomers component
// -------------------------

const initialCacheState: Record<CacheKey, CacheEntry<any, any>> = {
  services_ManageServices: { data: null, lastFetchTime: null },
  branches_ManageServices: { data: null, lastFetchTime: null },
  serviceSets_ManageServiceSets: { data: null, lastFetchTime: null },
  availableServices_ManageServiceSets: { data: null, lastFetchTime: null },
  accounts_ManageAccounts: { data: null, lastFetchTime: null },
  branches_ManageAccounts: { data: null, lastFetchTime: null },
  transactions_ManageTransactions: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  vouchers_ManageVouchers: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  payslips_ManagePayslips: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  accounts_ManagePayslips: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  requests_ManagePayslips: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  // --- Initialize Existing New Keys ---
  branches_ManageGiftCertificates: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  items_ManageGiftCertificates: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  activeGCs_ManageGiftCertificates: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  services_ManageDiscounts: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  discountRules_ManageDiscounts: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  branches_ManageBranches: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  customers_SendEmail: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  // --- INITIALIZE THE NEW KEY HERE ---
  emailTemplates_ManageEmailTemplates: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  // --- INITIALIZE THE NEW KEY HERE ---
  customers_ManageCustomers: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  // -----------------------------------
};

// Deep copy initial state to ensure dataCache is mutable without affecting initialCacheState
// Note: In a real app with server-side cache (e.g., Redis), dataCache would likely be
// a mechanism interacting with that store, not an in-memory object like this.
// This in-memory approach is useful for simple server component caching within a single request/server instance.
// For broader cache invalidation across server instances, a shared cache store is needed.
const dataCache: Record<CacheKey, CacheEntry<any, any>> = JSON.parse(
  JSON.stringify(initialCacheState),
);

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Helper for deep equality check for params
function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  if (
    obj1 === null ||
    obj1 === undefined ||
    obj2 === null ||
    obj2 === undefined
  ) {
    return obj1 === obj2;
  }
  if (typeof obj1 !== "object" || typeof obj2 !== "object") {
    return obj1 === obj2; // Handles primitives
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }
  return true;
}

export function getCachedData<T, P = any>(
  key: CacheKey,
  currentParams?: P,
): T | null {
  const entry = dataCache[key] as CacheEntry<T, P>; // Type assertion
  if (
    entry.data &&
    entry.lastFetchTime &&
    Date.now() - entry.lastFetchTime < CACHE_DURATION_MS
  ) {
    // If parameters are involved for this key
    if (
      key === "transactions_ManageTransactions" ||
      key === "vouchers_ManageVouchers" ||
      key === "payslips_ManagePayslips" ||
      key === "accounts_ManagePayslips" ||
      key === "requests_ManagePayslips"
    ) {
      if (deepEqual(entry.lastFetchParams, currentParams)) {
        // console.log(`[Cache] HIT for ${key} with matching params:`, currentParams);
        return entry.data;
      } else {
        // console.log(`[Cache] MISS for ${key} due to param mismatch. Cached:`, entry.lastFetchParams, "Requested:", currentParams);
        return null; // Params don't match, treat as cache miss
      }
    } else {
      // For keys without parameters (like simple lists)
      // console.log(`[Cache] HIT for ${key} (no params involved)`);
      return entry.data;
    }
  }
  // console.log(`[Cache] MISS for ${key} (stale, no data, or initial load). Requested params:`, currentParams);
  return null; // Cache is stale or empty
}

export function setCachedData<T, P = any>(
  key: CacheKey,
  data: T,
  params?: P,
): void {
  // console.log(`[Cache] SET for ${key} with params:`, params);
  const entry = dataCache[key] as CacheEntry<T, P>; // Type assertion
  entry.data = data;
  entry.lastFetchTime = Date.now();

  // Only store params if they are provided (useful for list with filters/pagination)
  if (params !== undefined) {
    entry.lastFetchParams = params;
  } else {
    // Ensure no old params are kept if params are not used for this fetch
    delete entry.lastFetchParams;
  }
}

export function invalidateCache(keys?: CacheKey | CacheKey[]): void {
  const keysToInvalidate: CacheKey[] = keys
    ? Array.isArray(keys)
      ? keys
      : [keys]
    : (Object.keys(dataCache) as CacheKey[]); // If no key specified, invalidate all

  keysToInvalidate.forEach((key) => {
    if (dataCache[key]) {
      // console.log(`[Cache] INVALIDATE for ${key}`);
      dataCache[key].data = null;
      dataCache[key].lastFetchTime = null;
      delete dataCache[key].lastFetchParams; // Also clear parameters on invalidation
    }
  });
}

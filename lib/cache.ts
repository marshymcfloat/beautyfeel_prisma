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
  | "branches_ManageGiftCertificates" // Branches for GC form
  | "items_ManageGiftCertificates" // Services/Sets for GC form
  | "activeGCs_ManageGiftCertificates" // List of active GCs
  | "services_ManageDiscounts" // Services for Discount form
  | "discountRules_ManageDiscounts" // List of discount rules
  | "branches_ManageBranches" // List of branches in ManageBranches
  | "customers_SendEmail" // For the customer list in SendEmailToCustomers component
  | "emailTemplates_ManageEmailTemplates" // For the list of email templates
  | "customers_ManageCustomers" // For the list of customers in ManageCustomers component
  | "salesData_daily"
  | "salesData_monthly"
  | "salesData_yearly"
  | "allBranchesList_sales"
  | "allServicesList_transactionModal"; // <-- NEW KEY for Add Service in Transaction Modal

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
  emailTemplates_ManageEmailTemplates: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  customers_ManageCustomers: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  salesData_daily: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  salesData_monthly: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  salesData_yearly: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  allBranchesList_sales: {
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
  allServicesList_transactionModal: {
    // <-- INITIALIZE NEW KEY
    data: null,
    lastFetchTime: null,
    lastFetchParams: undefined,
  },
};

const dataCache: Record<CacheKey, CacheEntry<any, any>> = JSON.parse(
  JSON.stringify(initialCacheState),
);

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

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
    return obj1 === obj2;
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
  const entry = dataCache[key] as CacheEntry<T, P>;
  if (!entry) {
    // console.warn(`[Cache] Attempted to get data for unknown key: ${key}`);
    return null;
  }

  if (
    entry.data &&
    entry.lastFetchTime &&
    Date.now() - entry.lastFetchTime < CACHE_DURATION_MS
  ) {
    const keysWithParams: CacheKey[] = [
      "transactions_ManageTransactions",
      "vouchers_ManageVouchers",
      "payslips_ManagePayslips",
      "accounts_ManagePayslips",
      "requests_ManagePayslips",
    ];

    if (keysWithParams.includes(key)) {
      if (deepEqual(entry.lastFetchParams, currentParams)) {
        // console.log(`[Cache] HIT for ${key} with matching params:`, currentParams);
        return entry.data;
      } else {
        // console.log(`[Cache] MISS for ${key} due to param mismatch. Cached:`, entry.lastFetchParams, "Requested:", currentParams);
        return null;
      }
    } else {
      // console.log(`[Cache] HIT for ${key} (params not used for invalidation or no params)`);
      return entry.data;
    }
  }
  // console.log(`[Cache] MISS for ${key} (stale, no data, or initial load). Requested params:`, currentParams);
  return null;
}

export function setCachedData<T, P = any>(
  key: CacheKey,
  data: T,
  params?: P,
): void {
  const entry = dataCache[key] as CacheEntry<T, P>;
  if (!entry) {
    // console.warn(`[Cache] Attempted to set data for unknown key: ${key}`);
    return;
  }
  // console.log(`[Cache] SET for ${key} with params:`, params);
  entry.data = data;
  entry.lastFetchTime = Date.now();
  if (params !== undefined) {
    entry.lastFetchParams = params;
  } else {
    delete entry.lastFetchParams;
  }
}

export function invalidateCache(keys?: CacheKey | CacheKey[]): void {
  const keysToInvalidate: CacheKey[] = keys
    ? Array.isArray(keys)
      ? keys
      : [keys]
    : (Object.keys(dataCache) as CacheKey[]);

  keysToInvalidate.forEach((key) => {
    if (dataCache[key]) {
      // console.log(`[Cache] INVALIDATE for ${key}`);
      dataCache[key].data = null;
      dataCache[key].lastFetchTime = null;
      delete dataCache[key].lastFetchParams;
    } else {
      // console.warn(`[Cache] Attempted to invalidate unknown key: ${key}`);
    }
  });
}

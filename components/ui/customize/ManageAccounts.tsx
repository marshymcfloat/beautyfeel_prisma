"use client";

import React, {
  useState,
  useEffect,
  useTransition,
  useRef,
  useCallback,
} from "react";
import {
  createAccountAction,
  updateAccountAction,
  deleteAccountAction,
  getAccountsAction,
  getBranchesForSelectAction,
} from "@/lib/ServerAction";
import Button from "@/components/Buttons/Button";
import { AccountForManagement, BranchForSelect } from "@/lib/Types";
import { Role } from "@prisma/client";
import { Plus, Edit3, Trash2, RefreshCw } from "lucide-react";
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CacheKey,
} from "@/lib/cache";

const ALL_ROLES = Object.values(Role);
const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const ACCOUNTS_CACHE_KEY: CacheKey = "accounts_ManageAccounts";
const BRANCHES_ACCOUNTS_CACHE_KEY: CacheKey = "branches_ManageAccounts";

export default function ManageAccounts() {
  const [accounts, setAccounts] = useState<AccountForManagement[]>([]);
  const [branches, setBranches] = useState<BranchForSelect[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[] | undefined>
  >({});
  const [listError, setListError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] =
    useState<AccountForManagement | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const resetFormState = () => {
    setFormError(null);
    setFieldErrors({});
  };

  const loadData = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setListError(null);

    let accData = !forceRefresh
      ? getCachedData<AccountForManagement[]>(ACCOUNTS_CACHE_KEY)
      : null;
    let brData = !forceRefresh
      ? getCachedData<BranchForSelect[]>(BRANCHES_ACCOUNTS_CACHE_KEY)
      : null;

    if (accData && brData && !forceRefresh) {
      setAccounts(accData);
      setBranches(brData);
      setIsLoading(false);
      return;
    }

    try {
      const promises: [
        Promise<AccountForManagement[]>,
        Promise<BranchForSelect[]>,
      ] = [
        accData && !forceRefresh
          ? Promise.resolve(accData)
          : getAccountsAction().then((data) => {
              setCachedData<AccountForManagement[]>(ACCOUNTS_CACHE_KEY, data);
              return data;
            }),
        brData && !forceRefresh
          ? Promise.resolve(brData)
          : getBranchesForSelectAction().then((data) => {
              setCachedData<BranchForSelect[]>(
                BRANCHES_ACCOUNTS_CACHE_KEY,
                data,
              );
              return data;
            }),
      ];
      const [fetchedAccounts, fetchedBranches] = await Promise.all(promises);
      setAccounts(fetchedAccounts);
      setBranches(fetchedBranches);
    } catch (err: any) {
      setListError(err.message || "Failed to load accounts or branches.");
      setAccounts(accData || []);
      setBranches(brData || []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    loadData(true);
  }, [loadData]);

  const handleAdd = () => {
    setEditingAccount(null);
    resetFormState();
    setIsModalOpen(true);

    setTimeout(() => {
      if (formRef.current) {
        formRef.current.reset();
        const input = formRef.current.elements.namedItem(
          "dailyRate",
        ) as HTMLInputElement | null;
        if (input && !input.value) input.value = "350";
      }
    }, 0);
  };

  const handleEdit = (account: AccountForManagement) => {
    setEditingAccount(account);
    resetFormState();
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  useEffect(() => {
    if (!isModalOpen) {
      setEditingAccount(null);
      resetFormState();
    }
  }, [isModalOpen]);

  const handleDelete = (accountId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this account? This action cannot be undone.",
      )
    )
      return;
    setListError(null);
    startTransition(async () => {
      const res = await deleteAccountAction(accountId);
      if (!res.success)
        setListError(res.message || "Failed to delete account.");
      else {
        invalidateCache(ACCOUNTS_CACHE_KEY);
        await loadData();
      }
    });
  };

  const handleSave = () => {
    if (!formRef.current) {
      setFormError("Form reference error. Please try again.");
      return;
    }
    resetFormState();
    const fd = new FormData(formRef.current);
    const username = fd.get("username") as string;
    const name = fd.get("name") as string;
    const email = fd.get("email") as string;
    const rate = fd.get("dailyRate");

    let currentFieldErrors: Record<string, string[]> = {};
    if (!username?.trim())
      currentFieldErrors.username = ["Username is required."];
    if (!name?.trim()) currentFieldErrors.name = ["Full Name is required."];
    if (!editingAccount) {
      if (!email?.trim())
        currentFieldErrors.email = ["Email is required for new accounts."];
      else if (!isValidEmail(email))
        currentFieldErrors.email = ["Please enter a valid email address."];
    } else {
      if (email?.trim() && !isValidEmail(email))
        currentFieldErrors.email = ["Please enter a valid email address."];
    }
    if (!rate || isNaN(Number(rate)) || Number(rate) < 0)
      currentFieldErrors.dailyRate = [
        "A valid, non-negative daily rate is required.",
      ];
    if (
      ALL_ROLES.filter((role) => fd.get(`role-${role}`) === "on").length === 0
    )
      currentFieldErrors.roles = ["At least one role must be selected."];

    if (Object.keys(currentFieldErrors).length > 0) {
      setFieldErrors(currentFieldErrors);
      setFormError("Please correct the errors in the form.");
      return;
    }

    startTransition(async () => {
      try {
        const action = editingAccount
          ? updateAccountAction(editingAccount.id, fd)
          : createAccountAction(fd);
        const res = await action;
        if (!res) throw new Error("No response from server action.");
        if (res.success) {
          closeModal();
          invalidateCache(ACCOUNTS_CACHE_KEY);
          await loadData();
          alert(res.message || "Account saved successfully!");
        } else {
          setFormError(res.message || "An error occurred.");
          if (res.errors) setFieldErrors(res.errors);
        }
      } catch (err: any) {
        setFormError(
          err.message || "An unexpected error occurred during save.",
        );
      }
    });
  };

  const isSaving = isPending;
  const formatPHP = (value: number | null | undefined): string =>
    (value ?? 0).toLocaleString("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  const thStyleBase =
    "px-3 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
  const tdStyleBase = "px-3 py-2 text-sm text-customBlack/90 align-top";
  const inputStyle = (hasError?: boolean) =>
    `mt-1 block w-full rounded border ${hasError ? "border-red-500" : "border-customGray"} p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:bg-gray-100 disabled:cursor-not-allowed`;
  const labelStyle = "block text-sm font-medium text-customBlack/80";
  const checkboxStyle =
    "h-4 w-4 rounded border-customGray text-customDarkPink focus:ring-customDarkPink";
  const checkboxLabelStyle = "ml-2 block text-sm text-customBlack";
  const errorMsgStyle =
    "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
  const modalErrorStyle =
    "text-sm text-red-600 mb-3 p-3 bg-red-100 border border-red-300 rounded";
  const fieldErrorStyle = "mt-1 text-xs text-red-600";

  return (
    <div className="p-1">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-customBlack">
          Manage Accounts
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={handleRefresh}
            disabled={isLoading || isPending}
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
          >
            <RefreshCw
              size={16}
              className={`mr-1 ${isLoading ? "animate-spin" : ""}`}
            />{" "}
            Refresh
          </Button>
          <Button
            onClick={handleAdd}
            disabled={isLoading || isPending}
            size="sm"
            className="w-full sm:w-auto"
          >
            <Plus size={16} className="mr-1" /> Add New Account
          </Button>
        </div>
      </div>

      {listError && !isModalOpen && (
        <p className={errorMsgStyle}>{listError}</p>
      )}

      <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
        {isLoading && accounts.length === 0 ? (
          <p className="py-10 text-center text-customBlack/70">
            Loading accounts...
          </p>
        ) : !listError && accounts.length === 0 ? (
          <p className="py-10 text-center text-customBlack/60">
            No accounts found.
          </p>
        ) : (
          <table className="min-w-full divide-y divide-customGray/30">
            <thead className="bg-customGray/10">
              <tr>
                <th className={thStyleBase}>User</th>
                <th className={`${thStyleBase} hidden sm:table-cell`}>Name</th>
                <th className={`${thStyleBase} hidden sm:table-cell`}>Email</th>
                <th className={`${thStyleBase} hidden sm:table-cell`}>Roles</th>
                <th className={thStyleBase}>Rate</th>
                <th className={`${thStyleBase} hidden sm:table-cell`}>
                  Branch
                </th>
                <th className={`${thStyleBase} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/30">
              {accounts.map((a) => (
                <tr key={a.id} className="hover:bg-customLightBlue/10">
                  <td className={`${tdStyleBase} font-medium`}>{a.username}</td>
                  <td className={`${tdStyleBase} hidden sm:table-cell`}>
                    {a.name}
                  </td>
                  <td className={`${tdStyleBase} hidden sm:table-cell`}>
                    {a.email ?? (
                      <span className="italic text-gray-400">N/A</span>
                    )}
                  </td>
                  <td
                    className={`${tdStyleBase} hidden capitalize sm:table-cell`}
                  >
                    {(a.role || [])
                      .map((r) => r.toLowerCase().replace("_", " "))
                      .join(", ") || "-"}
                  </td>
                  <td className={`${tdStyleBase} whitespace-nowrap`}>
                    {formatPHP(a.dailyRate)}
                  </td>
                  <td className={`${tdStyleBase} hidden sm:table-cell`}>
                    {a.branch?.title ?? (
                      <span className="italic text-gray-400">N/A</span>
                    )}
                  </td>
                  <td className={`${tdStyleBase} whitespace-nowrap text-right`}>
                    <button
                      onClick={() => handleEdit(a)}
                      disabled={isPending}
                      className="mr-2 inline-block p-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      title="Edit"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(a.id)}
                      disabled={isPending || a.role.includes(Role.OWNER)}
                      className={`inline-block p-1 text-red-600 hover:text-red-800 disabled:opacity-50 ${a.role.includes(Role.OWNER) ? "cursor-not-allowed" : ""}`}
                      title={
                        a.role.includes(Role.OWNER)
                          ? "Cannot delete OWNER"
                          : "Delete"
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={
          <DialogTitle>
            {editingAccount ? "Edit Account" : "Add New Account"}
          </DialogTitle>
        }
        containerClassName="relative m-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-customOffWhite p-6 shadow-xl"
      >
        {formError && <p className={modalErrorStyle}>{formError}</p>}
        <form
          key={editingAccount?.id ?? "new-account-form"}
          ref={formRef}
          onSubmit={(e) => e.preventDefault()}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="username" className={labelStyle}>
                Username*
              </label>
              <input
                type="text"
                name="username"
                id="username"
                required
                maxLength={20}
                defaultValue={editingAccount?.username ?? ""}
                className={inputStyle(!!fieldErrors.username)}
                aria-invalid={!!fieldErrors.username}
                aria-describedby={
                  fieldErrors.username ? "username-error" : undefined
                }
              />
              {fieldErrors.username && (
                <p id="username-error" className={fieldErrorStyle}>
                  {fieldErrors.username.join(", ")}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">Max 20 chars.</p>
            </div>
            <div>
              <label htmlFor="name" className={labelStyle}>
                Full Name*
              </label>
              <input
                type="text"
                name="name"
                id="name"
                required
                defaultValue={editingAccount?.name ?? ""}
                className={inputStyle(!!fieldErrors.name)}
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? "name-error" : undefined}
              />
              {fieldErrors.name && (
                <p id="name-error" className={fieldErrorStyle}>
                  {fieldErrors.name.join(", ")}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="email" className={labelStyle}>
                Email{editingAccount ? "" : "*"}
              </label>
              <input
                type="email"
                name="email"
                id="email"
                required={!editingAccount}
                defaultValue={editingAccount?.email ?? ""}
                className={inputStyle(!!fieldErrors.email)}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
              />
              {fieldErrors.email && (
                <p id="email-error" className={fieldErrorStyle}>
                  {fieldErrors.email.join(", ")}
                </p>
              )}
              {!editingAccount && (
                <p className="mt-1 text-xs text-gray-500">
                  Required. A temporary password will be sent.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="dailyRate" className={labelStyle}>
                Daily Rate (PHP)*
              </label>
              <input
                type="number"
                name="dailyRate"
                id="dailyRate"
                required
                min="0"
                step="1"
                defaultValue={editingAccount?.dailyRate?.toString() ?? "350"}
                className={inputStyle(!!fieldErrors.dailyRate)}
                placeholder="e.g., 350"
                aria-invalid={!!fieldErrors.dailyRate}
                aria-describedby={
                  fieldErrors.dailyRate ? "dailyRate-error" : undefined
                }
              />
              {fieldErrors.dailyRate && (
                <p id="dailyRate-error" className={fieldErrorStyle}>
                  {fieldErrors.dailyRate.join(", ")}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                e.g., 350 for ₱350.00
              </p>
            </div>
            <div>
              <label htmlFor="branchId" className={labelStyle}>
                Branch
              </label>
              <select
                name="branchId"
                id="branchId"
                defaultValue={editingAccount?.branchId ?? ""}
                className={`${inputStyle(!!fieldErrors.branchId)} bg-white`}
                aria-invalid={!!fieldErrors.branchId}
                aria-describedby={
                  fieldErrors.branchId ? "branchId-error" : undefined
                }
              >
                <option value="">-- No Branch --</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
              {fieldErrors.branchId && (
                <p id="branchId-error" className={fieldErrorStyle}>
                  {fieldErrors.branchId.join(", ")}
                </p>
              )}
            </div>
          </div>
          <fieldset className="pt-2">
            <legend
              className={`${labelStyle} ${fieldErrors.roles ? "text-red-600" : ""}`}
            >
              Roles*
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {ALL_ROLES.map((role) => (
                <div key={role} className="flex items-center">
                  <input
                    id={`role-${role}`}
                    name={`role-${role}`}
                    type="checkbox"
                    defaultChecked={editingAccount?.role?.includes(role)}
                    className={checkboxStyle}
                  />
                  <label
                    htmlFor={`role-${role}`}
                    className={checkboxLabelStyle}
                  >
                    {role.charAt(0) +
                      role.slice(1).toLowerCase().replace("_", " ")}
                  </label>
                </div>
              ))}
            </div>
            {fieldErrors.roles && (
              <p className={fieldErrorStyle}>{fieldErrors.roles.join(", ")}</p>
            )}
          </fieldset>
          <div className="flex justify-end space-x-3 border-t border-customGray/30 pt-4">
            <Button
              type="button"
              onClick={closeModal}
              disabled={isSaving}
              invert
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving
                ? "Saving..."
                : editingAccount
                  ? "Save Changes"
                  : "Create Account"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

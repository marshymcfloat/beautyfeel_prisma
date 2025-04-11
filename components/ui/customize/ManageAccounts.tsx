// src/components/ui/customize/ManageAccounts.tsx
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
import { Plus, Edit3, Trash2 } from "lucide-react";
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";

const ALL_ROLES = Object.values(Role);

export default function ManageAccounts() {
  const [accounts, setAccounts] = useState<AccountForManagement[]>([]);
  const [branches, setBranches] = useState<BranchForSelect[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] =
    useState<AccountForManagement | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setListError(null);
    try {
      const [fetchedAccounts, fetchedBranches] = await Promise.all([
        getAccountsAction(),
        getBranchesForSelectAction(),
      ]);
      setAccounts(fetchedAccounts);
      setBranches(fetchedBranches);
    } catch (err: any) {
      setListError(err.message || "Failed load.");
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdd = () => {
    setEditingAccount(null);
    setFormError(null);
    setIsModalOpen(true);
    formRef.current?.reset();
    setTimeout(() => {
      const input = formRef.current?.elements.namedItem(
        "dailyRate",
      ) as HTMLInputElement | null;
      if (input && !input.value) input.value = "350";
    }, 0);
  };
  const handleEdit = (account: AccountForManagement) => {
    setEditingAccount(account);
    setFormError(null);
    setIsModalOpen(true);
  };
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingAccount(null);
    setFormError(null);
    formRef.current?.reset();
  };
  const handleDelete = (accountId: string) => {
    if (!window.confirm("Delete?")) return;
    setListError(null);
    startTransition(async () => {
      const res = await deleteAccountAction(accountId);
      if (!res.success) setListError(res.message);
      else await loadData();
    });
  };
  const handleSave = () => {
    if (!formRef.current) return setFormError("Form error.");
    setFormError(null);
    const fd = new FormData(formRef.current);
    if (!fd.get("username") || !fd.get("name"))
      return setFormError("Username/Name required.");
    if (
      !editingAccount &&
      (!fd.get("password") || (fd.get("password") as string).length < 6)
    )
      return setFormError("Password (min 6) required.");
    const rate = fd.get("dailyRate");
    if (!rate || isNaN(Number(rate)) || Number(rate) < 0)
      return setFormError("Valid rate required.");
    if (
      ALL_ROLES.filter((role) => fd.get(`role-${role}`) === "on").length === 0
    )
      return setFormError("Select role.");
    startTransition(async () => {
      try {
        const action = editingAccount
          ? updateAccountAction(editingAccount.id, fd)
          : createAccountAction(fd);
        const res = await action;
        if (!res) throw new Error("No result");
        if (res.success) {
          closeModal();
          await loadData();
        } else {
          let msg = res.message;
          if (res.errors)
            msg += ` (${Object.entries(res.errors)
              .map(([f, e]) => `${f}: ${e?.join(",")}`)
              .join("; ")})`;
          setFormError(msg);
        }
      } catch (err: any) {
        setFormError(err.message || "Error");
      }
    });
  };

  const isSaving = isPending;
  const formatPHP = (value: number | null | undefined): string => {
    return (value ?? 0).toLocaleString("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 0, // Show whole pesos for rate for brevity
      maximumFractionDigits: 0,
    });
  };

  // --- Styles ---
  const thStyleBase =
    "px-3 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
  const tdStyleBase = "px-3 py-2 text-sm text-customBlack/90 align-top"; // Use align-top
  const inputStyle =
    "mt-1 block w-full rounded border border-customGray p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:bg-gray-100 disabled:cursor-not-allowed";
  const labelStyle = "block text-sm font-medium text-customBlack/80";
  const checkboxStyle =
    "h-4 w-4 rounded border-customGray text-customDarkPink focus:ring-customDarkPink";
  const checkboxLabelStyle = "ml-2 block text-sm text-customBlack";
  const errorMsgStyle =
    "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
  const modalErrorStyle = "text-xs text-red-600 mb-3";

  return (
    <div className="p-1">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-customBlack">
          Manage Accounts
        </h2>
        <Button
          onClick={handleAdd}
          disabled={isPending || isLoading}
          size="sm"
          className="w-full sm:w-auto"
        >
          <Plus size={16} className="mr-1" /> Add New Account
        </Button>
      </div>

      {listError && !isModalOpen && (
        <p className={errorMsgStyle}>{listError}</p>
      )}

      {/* Table */}
      <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
        {isLoading ? (
          <p className="py-10 text-center text-customBlack/70">Loading...</p>
        ) : !listError && accounts.length === 0 ? (
          <p className="py-10 text-center text-customBlack/60">No accounts.</p>
        ) : (
          <table className="min-w-full divide-y divide-customGray/30">
            <thead className="bg-customGray/10">
              <tr>
                {/* User: Always Visible */}
                <th className={thStyleBase}>User</th>
                {/* Name: Hidden on xs, visible sm+ */}
                <th className={`${thStyleBase} hidden sm:table-cell`}>Name</th>
                {/* Email: Hidden on xs, visible sm+ */}
                <th className={`${thStyleBase} hidden sm:table-cell`}>Email</th>
                {/* Roles: Hidden on xs, visible sm+ */}
                <th className={`${thStyleBase} hidden sm:table-cell`}>Roles</th>
                {/* Rate: Always Visible */}
                <th className={thStyleBase}>Rate</th>
                {/* Branch: Hidden on xs, visible sm+ */}
                <th className={`${thStyleBase} hidden sm:table-cell`}>
                  Branch
                </th>
                {/* Actions: Always Visible */}
                <th className={`${thStyleBase} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/30">
              {accounts.map((a) => (
                <tr key={a.id} className="hover:bg-customLightBlue/10">
                  {/* User: medium weight, can wrap */}
                  <td className={`${tdStyleBase} font-medium`}>{a.username}</td>
                  {/* Name: Hidden on xs */}
                  <td className={`${tdStyleBase} hidden sm:table-cell`}>
                    {a.name}
                  </td>
                  {/* Email: Hidden on xs */}
                  <td className={`${tdStyleBase} hidden sm:table-cell`}>
                    {a.email ?? (
                      <span className="italic text-gray-400">N/A</span>
                    )}
                  </td>
                  {/* Roles: Hidden on xs, capitalize */}
                  <td
                    className={`${tdStyleBase} hidden capitalize sm:table-cell`}
                  >
                    {(a.role || [])
                      .map((r) => r.toLowerCase().replace("_", " "))
                      .join(", ") || "-"}
                  </td>
                  {/* Rate: Always visible, no wrap */}
                  <td className={`${tdStyleBase} whitespace-nowrap`}>
                    {formatPHP(a.dailyRate)}
                  </td>
                  {/* Branch: Hidden on xs */}
                  <td className={`${tdStyleBase} hidden sm:table-cell`}>
                    {a.branch?.title ?? (
                      <span className="italic text-gray-400">N/A</span>
                    )}
                  </td>
                  {/* Actions: Always visible, no wrap, right aligned */}
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

      {/* Modal (No changes needed here for table responsiveness) */}
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
          key={editingAccount?.id ?? "new"}
          ref={formRef}
          onSubmit={(e) => e.preventDefault()}
          className="space-y-4"
        >
          {/* Modal Form Fields... (keep existing) */}
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
                className={inputStyle}
              />
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
                className={inputStyle}
              />
            </div>
            {!editingAccount && (
              <div>
                <label htmlFor="password" className={labelStyle}>
                  Password*
                </label>
                <input
                  type="password"
                  name="password"
                  id="password"
                  required
                  minLength={6}
                  className={inputStyle}
                />
                <p className="mt-1 text-xs text-gray-500">Min 6 chars.</p>
              </div>
            )}
            <div>
              <label htmlFor="email" className={labelStyle}>
                Email
              </label>
              <input
                type="email"
                name="email"
                id="email"
                defaultValue={editingAccount?.email ?? ""}
                className={inputStyle}
              />
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
                className={inputStyle}
                placeholder="e.g., 350"
              />
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
                className={`${inputStyle} bg-white`}
              >
                <option value="">-- No Branch --</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <fieldset className="pt-2">
            <legend className={labelStyle}>Roles*</legend>
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

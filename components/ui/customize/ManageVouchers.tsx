// src/components/ui/customize/ManageVouchers.tsx
"use client";
import React, {
  useState,
  useEffect,
  useTransition,
  useRef,
  useCallback,
} from "react";
import {
  createVoucherAction,
  updateVoucherAction,
  deleteVoucherAction,
  getAllVouchers,
} from "@/lib/ServerAction";
import { Voucher as PrismaVoucher } from "@prisma/client";
import Button from "@/components/Buttons/Button";
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import { Plus, Edit3, Trash2, CheckCircle, XCircle } from "lucide-react";

type Voucher = PrismaVoucher;

export default function ManageVouchers() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setListError(null);
    try {
      const fetched = await getAllVouchers();
      setVouchers(fetched);
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
    setEditingVoucher(null);
    setFormError(null);
    setIsModalOpen(true);
    formRef.current?.reset();
  };
  const handleEdit = (voucher: Voucher) => {
    if (voucher.usedAt) return alert("Cannot edit a used voucher."); // More user-friendly than just returning
    setEditingVoucher(voucher);
    setFormError(null);
    setIsModalOpen(true);
  };
  const handleDelete = (voucherId: string) => {
    if (!window.confirm("Delete this voucher permanently?")) return;
    setListError(null);
    startTransition(async () => {
      const res = await deleteVoucherAction(voucherId);
      if (!res.success) setListError(res.message);
      else await loadData();
    });
  };
  const handleSave = () => {
    if (!formRef.current) return setFormError("Form error.");
    setFormError(null);
    const fd = new FormData(formRef.current);
    if (!editingVoucher && !fd.get("code"))
      return setFormError("Code is required for new vouchers.");
    if (!fd.get("value") || Number(fd.get("value")) <= 0)
      return setFormError("A positive value is required.");
    startTransition(async () => {
      try {
        const action = editingVoucher
          ? updateVoucherAction(editingVoucher.id, fd)
          : createVoucherAction(fd);
        const res = await action;
        if (res.success) {
          setIsModalOpen(false);
          setEditingVoucher(null);
          await loadData();
        } else {
          let msg = res.message;
          if (res.errors) msg += ` (${Object.values(res.errors).join(", ")})`;
          setFormError(msg);
        }
      } catch (err) {
        setFormError("An unexpected error occurred.");
      }
    });
  };
  const closeModal = () => setIsModalOpen(false);
  const isSaving = isPending;

  // --- Styles & Helpers ---
  const thStyleBase =
    "px-4 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
  const tdStyleBase = "px-4 py-2 text-sm text-customBlack/90 align-top"; // Use align-top
  const inputStyle =
    "mt-1 block w-full rounded border border-customGray p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:bg-gray-100 disabled:cursor-not-allowed";
  const labelStyle = "block text-sm font-medium text-customBlack/80";
  const errorMsgStyle =
    "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
  const modalErrorStyle = "text-xs text-red-600 mb-3";
  const statusBadgeBase =
    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium";

  return (
    <div className="p-1">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-customBlack">
          Manage Vouchers
        </h2>
        <Button
          onClick={handleAdd}
          disabled={isPending || isLoading}
          size="sm"
          className="w-full sm:w-auto"
        >
          <Plus size={16} className="mr-1" /> Add New Voucher
        </Button>
      </div>

      {listError && !isModalOpen && (
        <p className={errorMsgStyle}>{listError}</p>
      )}

      {/* Table */}
      <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
        {isLoading ? (
          <p className="py-10 text-center text-customBlack/70">Loading...</p>
        ) : !listError && vouchers.length === 0 ? (
          <p className="py-10 text-center text-customBlack/60">No vouchers.</p>
        ) : (
          <table className="min-w-full divide-y divide-customGray/30">
            <thead className="bg-customGray/10">
              <tr>
                {/* Code: Always Visible */}
                <th className={thStyleBase}>Code</th>
                {/* Value: Always Visible */}
                <th className={thStyleBase}>Value</th>
                {/* Status: Hidden on xs, visible sm+ */}
                <th className={`${thStyleBase} hidden sm:table-cell`}>
                  Status
                </th>
                {/* Actions: Always Visible */}
                <th className={`${thStyleBase} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/30">
              {vouchers.map((v) => (
                <tr
                  key={v.id}
                  className={`hover:bg-customLightBlue/10 ${v.usedAt ? "opacity-60" : ""}`}
                >
                  {/* Code: Always visible, no wrap, mono */}
                  <td
                    className={`${tdStyleBase} whitespace-nowrap font-mono uppercase`}
                  >
                    {v.code}
                  </td>
                  {/* Value: Always visible, no wrap */}
                  <td className={`${tdStyleBase} whitespace-nowrap`}>
                    {v.value}
                  </td>
                  {/* Status: Hidden on xs */}
                  <td className={`${tdStyleBase} hidden sm:table-cell`}>
                    {v.usedAt ? (
                      <span
                        className={`${statusBadgeBase} bg-red-100 text-red-700`}
                      >
                        <XCircle size={12} /> Used (
                        {new Date(v.usedAt).toLocaleDateString()})
                      </span>
                    ) : (
                      <span
                        className={`${statusBadgeBase} bg-green-100 text-green-700`}
                      >
                        <CheckCircle size={12} /> Active
                      </span>
                    )}
                  </td>
                  {/* Actions: Always visible, no wrap, right aligned */}
                  <td className={`${tdStyleBase} whitespace-nowrap text-right`}>
                    <button
                      onClick={() => handleEdit(v)}
                      disabled={!!v.usedAt || isPending}
                      className={`mr-2 inline-block p-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-50 ${v.usedAt ? "cursor-not-allowed" : ""}`}
                      title={
                        v.usedAt ? "Cannot edit used voucher" : "Edit Value"
                      }
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(v.id)}
                      disabled={isPending}
                      className="inline-block p-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                      title="Delete"
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
            {editingVoucher ? "Edit Voucher Value" : "Add New Voucher"}
          </DialogTitle>
        }
        containerClassName="relative m-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-customOffWhite p-6 shadow-xl"
      >
        {formError && <p className={modalErrorStyle}>{formError}</p>}
        <form
          ref={formRef}
          onSubmit={(e) => e.preventDefault()}
          className="space-y-4"
        >
          {/* Modal Form Fields... (keep existing) */}
          <div>
            <label htmlFor="code" className={labelStyle}>
              Voucher Code{" "}
              {!editingVoucher && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              name="code"
              id="code"
              required={!editingVoucher}
              defaultValue={editingVoucher?.code ?? ""}
              disabled={!!editingVoucher}
              className={`${inputStyle} font-mono uppercase tracking-wider`}
            />
            <p className="mt-1 text-xs text-gray-500">
              {editingVoucher
                ? "Code cannot be changed."
                : "Unique code (auto uppercase)."}
            </p>
          </div>
          <div>
            <label htmlFor="value" className={labelStyle}>
              Value (PHP Amount) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="value"
              id="value"
              required
              min="1"
              step="1"
              defaultValue={editingVoucher?.value ?? ""}
              className={inputStyle}
            />
          </div>
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
                : editingVoucher
                  ? "Save Value"
                  : "Create Voucher"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

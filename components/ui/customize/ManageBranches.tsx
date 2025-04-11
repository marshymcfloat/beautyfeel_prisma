// src/components/ui/customize/ManageBranches.tsx
"use client";
import React, {
  useState,
  useEffect,
  useTransition,
  useRef,
  useCallback,
} from "react";
import {
  createBranchAction,
  updateBranchAction,
  deleteBranchAction,
  getBranchesForSelectAction,
} from "@/lib/ServerAction";
import { Branch as PrismaBranch } from "@prisma/client";
import Button from "@/components/Buttons/Button";
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle"; // For modal title
import { Plus, Edit3, Trash2 } from "lucide-react";

type Branch = PrismaBranch;

export default function ManageBranches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // Combined error state
  const [isModalOpen, setIsModalOpen] = useState(false); // State for THIS modal
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // --- Load Data ---
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedBranches = await getBranchesForSelectAction();
      setBranches(fetchedBranches as Branch[]);
    } catch (err: any) {
      setError(err.message || "Failed to load data.");
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- REMOVE useEffect for body scroll lock ---

  // --- Modal and Action Handlers ---
  const handleAdd = () => {
    setEditingBranch(null);
    setError(null);
    setIsModalOpen(true);
    formRef.current?.reset();
  };
  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setError(null);
    setIsModalOpen(true);
  };
  const handleDelete = (branchId: string) => {
    /* ... (keep existing logic) ... */ if (!window.confirm("Delete?")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteBranchAction(branchId);
      if (!res.success) setError(res.message);
      else await loadData();
    });
  };
  const handleSave = () => {
    /* ... (keep existing logic, including validation) ... */ if (
      !formRef.current
    )
      return setError("Form error.");
    setError(null);
    const fd = new FormData(formRef.current);
    if (!fd.get("title")) return setError("Title required.");
    if (
      !editingBranch &&
      (!fd.get("code") || (fd.get("code") as string).length !== 6)
    )
      return setError("Code must be 6 chars.");
    startTransition(async () => {
      try {
        const action = editingBranch
          ? updateBranchAction(editingBranch.id, fd)
          : createBranchAction(fd);
        const res = await action;
        if (res.success) {
          setIsModalOpen(false);
          setEditingBranch(null);
          await loadData();
        } else {
          setError(
            res.message +
              (res.errors ? ` (${Object.values(res.errors).join(", ")})` : ""),
          );
        }
      } catch (err) {
        setError("Unexpected error.");
      }
    });
  };
  const closeModal = () => setIsModalOpen(false);
  const isSaving = isPending;

  // --- Styles ---
  const thStyle =
    "px-4 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
  const tdStyle = "px-4 py-2 whitespace-nowrap text-sm text-customBlack/90";
  const inputStyle =
    "mt-1 block w-full rounded border border-customGray p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:bg-gray-100 disabled:cursor-not-allowed";
  const labelStyle = "block text-sm font-medium text-customBlack/80";
  const errorMsgStyle =
    "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
  const modalErrorStyle = "text-xs text-red-600 mb-3"; // Specific style for modal error

  return (
    <div className="p-1">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-customBlack">
          Manage Branches
        </h2>
        <Button
          onClick={handleAdd}
          disabled={isPending}
          size="sm"
          className="w-full sm:w-auto"
        >
          <Plus size={16} className="mr-1" /> Add New Branch
        </Button>
      </div>

      {/* List Error */}
      {error && !isModalOpen && <p className={errorMsgStyle}>{error}</p>}

      {/* Table */}
      <div className="overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
        {/* ... Table structure (keep existing) ... */}
        {isLoading ? (
          <p className="py-10 text-center text-customBlack/70">Loading...</p>
        ) : branches.length === 0 ? (
          <p className="py-10 text-center text-customBlack/60">No branches.</p>
        ) : (
          <table className="min-w-full divide-y divide-customGray/30">
            <thead className="bg-customGray/10">
              <tr>
                <th className={thStyle}>Title</th>
                <th className={thStyle}>Code</th>
                <th className={`${thStyle} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/30">
              {branches.map((b) => (
                <tr key={b.id} className="hover:bg-customLightBlue/10">
                  <td className={`${tdStyle} font-medium`}>{b.title}</td>
                  <td className={`${tdStyle} font-mono uppercase`}>{b.code}</td>
                  <td className={`${tdStyle} text-right`}>
                    <button
                      onClick={() => handleEdit(b)}
                      disabled={isPending}
                      className="mr-2 p-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      title="Edit"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(b.id)}
                      disabled={isPending}
                      className="p-1 text-red-600 hover:text-red-800 disabled:opacity-50"
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

      {/* Modal using new component */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={
          <DialogTitle>
            {editingBranch ? "Edit Branch" : "Add New Branch"}
          </DialogTitle>
        }
        // Container class for sizing
        containerClassName="relative m-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-customOffWhite p-6 shadow-xl"
      >
        {/* Show form-specific errors inside modal */}
        {error && isModalOpen && <p className={modalErrorStyle}>{error}</p>}

        <form
          ref={formRef}
          onSubmit={(e) => e.preventDefault()}
          className="space-y-4"
        >
          <div>
            <label htmlFor="title" className={labelStyle}>
              Branch Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              id="title"
              required
              defaultValue={editingBranch?.title ?? ""}
              className={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="code" className={labelStyle}>
              {" "}
              Branch Code{" "}
              {!editingBranch && <span className="text-red-500">*</span>}{" "}
            </label>
            <input
              type="text"
              name="code"
              id="code"
              required={!editingBranch}
              maxLength={6}
              defaultValue={editingBranch?.code ?? ""}
              disabled={!!editingBranch}
              className={`${inputStyle} font-mono uppercase tracking-widest`}
            />
            <p className="mt-1 text-xs text-gray-500">
              {editingBranch
                ? "Code cannot be changed."
                : "Exactly 6 uppercase characters."}
            </p>
          </div>
          <div className="flex justify-end space-x-3 border-t border-customGray/30 pt-4">
            <Button
              type="button"
              onClick={closeModal}
              disabled={isSaving}
              invert
            >
              {" "}
              Cancel{" "}
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving
                ? "Saving..."
                : editingBranch
                  ? "Save Changes"
                  : "Create Branch"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

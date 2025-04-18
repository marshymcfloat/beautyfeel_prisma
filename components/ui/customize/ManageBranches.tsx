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
    if (!window.confirm("Delete this branch? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteBranchAction(branchId);
      if (!res.success) setError(res.message);
      else await loadData();
    });
  };
  const handleSave = () => {
    if (!formRef.current) return setError("Form reference error.");
    setError(null);
    const fd = new FormData(formRef.current);
    const title = fd.get("title");
    const code = fd.get("code");

    if (!title) return setError("Branch Title is required.");
    if (
      !editingBranch &&
      (!code || typeof code !== "string" || code.trim().length !== 6)
    ) {
      return setError("New Branch Code must be exactly 6 characters.");
    }

    startTransition(async () => {
      try {
        const action = editingBranch
          ? updateBranchAction(editingBranch.id, fd) // Update allows changing title, not code
          : createBranchAction(fd); // Create requires title and code
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
        setError("An unexpected error occurred during save.");
      }
    });
  };
  const closeModal = () => setIsModalOpen(false);
  const isSaving = isPending;

  // --- Styles (aligning with ManageAccounts) ---
  const thStyleBase =
    "px-3 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
  const tdStyleBase = "px-3 py-2 text-sm text-customBlack/90 align-top"; // Use align-top
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
          disabled={isPending || isLoading} // Disable if loading branches too
          size="sm"
          className="w-full sm:w-auto"
        >
          <Plus size={16} className="mr-1" /> Add New Branch
        </Button>
      </div>

      {/* List Error (show only if modal is closed) */}
      {error && !isModalOpen && <p className={errorMsgStyle}>{error}</p>}

      {/* Table - Use overflow-x-auto and min-w-full */}
      <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
        {isLoading ? (
          <p className="py-10 text-center text-customBlack/70">Loading...</p>
        ) : !error && branches.length === 0 ? (
          <p className="py-10 text-center text-customBlack/60">
            No branches found.
          </p>
        ) : (
          // Add min-w-full to table itself
          <table className="min-w-full divide-y divide-customGray/30">
            <thead className="bg-customGray/10">
              <tr>
                {/* Title: Always Visible */}
                <th className={thStyleBase}>Title</th>
                {/* Code: Hidden on xs, visible sm+ */}
                <th className={`${thStyleBase} hidden sm:table-cell`}>Code</th>
                {/* Actions: Always Visible */}
                <th className={`${thStyleBase} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/30">
              {branches.map((b) => (
                <tr key={b.id} className="hover:bg-customLightBlue/10">
                  {/* Title: Allow wrap, medium weight */}
                  <td className={`${tdStyleBase} font-medium`}>{b.title}</td>
                  {/* Code: Hidden on xs, visible sm+, monospace */}
                  <td
                    className={`${tdStyleBase} hidden font-mono uppercase sm:table-cell`}
                  >
                    {b.code}
                  </td>
                  {/* Actions: No wrap, right-aligned */}
                  <td className={`${tdStyleBase} whitespace-nowrap text-right`}>
                    <button
                      onClick={() => handleEdit(b)}
                      disabled={isPending}
                      className="mr-2 inline-block p-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      title="Edit Branch"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(b.id)}
                      disabled={isPending}
                      className="inline-block p-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                      title="Delete Branch"
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

      {/* Add/Edit Modal */}
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
              disabled={isSaving}
            />
          </div>
          <div>
            <label htmlFor="code" className={labelStyle}>
              Branch Code{" "}
              {!editingBranch && <span className="text-red-500">*</span>}{" "}
            </label>
            <input
              type="text"
              name="code"
              id="code"
              required={!editingBranch} // Required only when adding
              maxLength={6}
              minLength={6} // Enforce 6 chars
              pattern="[A-Z0-9]{6}" // Optional: Pattern for uppercase letters/numbers
              title="Must be 6 uppercase letters or numbers" // Tooltip for pattern
              defaultValue={editingBranch?.code ?? ""}
              disabled={!!editingBranch || isSaving} // Disable if editing or saving
              className={`${inputStyle} font-mono uppercase tracking-widest`}
              // Make visually clear it's disabled when editing
              readOnly={!!editingBranch}
            />
            <p className="mt-1 text-xs text-gray-500">
              {editingBranch
                ? "Code cannot be changed after creation."
                : "Exactly 6 uppercase characters or numbers."}
            </p>
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

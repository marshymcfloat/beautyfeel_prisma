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
  getBranchesForSelectAction, // Assuming this is the one that returns full Branch objects
} from "@/lib/ServerAction";
import { Branch as PrismaBranch } from "@prisma/client";
import Button from "@/components/Buttons/Button";
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import { Plus, Edit3, Trash2, RotateCcw as RefreshIcon } from "lucide-react"; // Added RefreshIcon

import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CacheKey,
} from "@/lib/cache";

// --- Cache Key ---
const BRANCHES_LIST_CACHE_KEY: CacheKey = "branches_ManageBranches";

type Branch = PrismaBranch;

export default function ManageBranches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const loadData = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);
    if (!forceRefresh) {
      const cached = getCachedData<Branch[]>(BRANCHES_LIST_CACHE_KEY);
      if (cached) {
        setBranches(cached);
        setIsLoading(false);
        return;
      }
    }
    try {
      const fetchedBranches = await getBranchesForSelectAction(); // Ensure this returns full Branch objects
      setBranches(fetchedBranches as Branch[]);
      setCachedData(BRANCHES_LIST_CACHE_KEY, fetchedBranches as Branch[]);
    } catch (err: any) {
      setError(err.message || "Failed to load data.");
      setBranches([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    invalidateCache(BRANCHES_LIST_CACHE_KEY);
    loadData(true);
  };

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
      else {
        invalidateCache(BRANCHES_LIST_CACHE_KEY);
        await loadData(true);
      }
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
          ? updateBranchAction(editingBranch.id, fd)
          : createBranchAction(fd);
        const res = await action;
        if (res.success) {
          setIsModalOpen(false);
          setEditingBranch(null);
          invalidateCache(BRANCHES_LIST_CACHE_KEY);
          await loadData(true);
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

  const thStyleBase =
    "px-3 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
  const tdStyleBase = "px-3 py-2 text-sm text-customBlack/90 align-top";
  const inputStyle =
    "mt-1 block w-full rounded border border-customGray p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:bg-gray-100 disabled:cursor-not-allowed";
  const labelStyle = "block text-sm font-medium text-customBlack/80";
  const errorMsgStyle =
    "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
  const modalErrorStyle = "text-xs text-red-600 mb-3";

  return (
    <div className="p-1">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-customBlack">
          {" "}
          Manage Branches{" "}
        </h2>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            onClick={handleRefresh}
            size="sm"
            variant="outline"
            className="flex w-full items-center justify-center gap-1.5 sm:w-auto"
            disabled={isLoading || isPending}
            title="Refresh Data"
          >
            <RefreshIcon size={16} />
            Refresh Data
          </Button>
          <Button
            onClick={handleAdd}
            disabled={isPending || isLoading}
            size="sm"
            className="w-full sm:w-auto"
          >
            <Plus size={16} className="mr-1" /> Add New Branch
          </Button>
        </div>
      </div>

      {error && !isModalOpen && <p className={errorMsgStyle}>{error}</p>}

      <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
        {isLoading ? (
          <p className="py-10 text-center text-customBlack/70">Loading...</p>
        ) : !error && branches.length === 0 ? (
          <p className="py-10 text-center text-customBlack/60">
            {" "}
            No branches found.{" "}
          </p>
        ) : (
          <table className="min-w-full divide-y divide-customGray/30">
            <thead className="bg-customGray/10">
              <tr>
                <th className={thStyleBase}>Title</th>
                <th className={`${thStyleBase} hidden sm:table-cell`}>Code</th>
                <th className={`${thStyleBase} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/30">
              {branches.map((b) => (
                <tr key={b.id} className="hover:bg-customLightBlue/10">
                  <td className={`${tdStyleBase} font-medium`}>{b.title}</td>
                  <td
                    className={`${tdStyleBase} hidden font-mono uppercase sm:table-cell`}
                  >
                    {" "}
                    {b.code}{" "}
                  </td>
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

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={
          <DialogTitle>
            {" "}
            {editingBranch ? "Edit Branch" : "Add New Branch"}{" "}
          </DialogTitle>
        }
        containerClassName="relative m-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-customOffWhite p-6 shadow-xl"
      >
        {error && isModalOpen && <p className={modalErrorStyle}>{error}</p>}
        <form
          ref={formRef}
          onSubmit={(e) => e.preventDefault()}
          className="space-y-4"
        >
          <div>
            <label htmlFor="title" className={labelStyle}>
              {" "}
              Branch Title <span className="text-red-500">*</span>{" "}
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
              minLength={6}
              pattern="[A-Z0-9]{6}"
              title="Must be 6 uppercase letters or numbers"
              defaultValue={editingBranch?.code ?? ""}
              disabled={!!editingBranch || isSaving}
              className={`${inputStyle} font-mono uppercase tracking-widest`}
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

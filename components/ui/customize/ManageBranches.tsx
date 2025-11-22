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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Edit3, Trash2, RotateCcw as RefreshIcon, Loader2 } from "lucide-react";

import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CacheKey,
} from "@/lib/cache";

const BRANCHES_LIST_CACHE_KEY: CacheKey = "branches_ManageBranches";

type Branch = PrismaBranch;

export default function ManageBranches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteBranchId, setPendingDeleteBranchId] = useState<string | null>(null);
  const [pendingDeleteBranchTitle, setPendingDeleteBranchTitle] = useState<string | null>(null);
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
      const fetchedBranches = await getBranchesForSelectAction();
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
  const handleDeleteClick = (branch: Branch) => {
    setPendingDeleteBranchId(branch.id);
    setPendingDeleteBranchTitle(branch.title);
    setDeleteDialogOpen(true);
  };

  const handleDelete = useCallback(async () => {
    if (!pendingDeleteBranchId) {
      setDeleteDialogOpen(false);
      return;
    }
    setError(null);
    setDeleteDialogOpen(false);
    startTransition(async () => {
      try {
        const res = await deleteBranchAction(pendingDeleteBranchId);
        if (!res.success) {
          const errorMsg = res.message || "Failed to delete branch.";
          setError(errorMsg);
          toast.error("Failed to delete branch", {
            description: errorMsg,
          });
        } else {
          toast.success("Branch deleted", {
            description: "The branch has been successfully deleted.",
          });
          invalidateCache(BRANCHES_LIST_CACHE_KEY);
          await loadData(true);
        }
      } catch (error: any) {
        const errorMsg = error.message || "An unexpected error occurred.";
        setError(errorMsg);
        toast.error("Error", {
          description: errorMsg,
        });
      } finally {
        setPendingDeleteBranchId(null);
        setPendingDeleteBranchTitle(null);
      }
    });
  }, [pendingDeleteBranchId, loadData]);
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
          toast.success("Branch saved", {
            description: res.message || "The branch has been saved successfully.",
          });
        } else {
          const errorMsg =
            res.message +
            (res.errors ? ` (${Object.values(res.errors).join(", ")})` : "");
          setError(errorMsg);
          toast.error("Failed to save branch", {
            description: errorMsg,
          });
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

      {error && !isModalOpen && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
        {isLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
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
                <th className={thStyleBase}>Code</th>
                <th className={`${thStyleBase} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/30">
              {branches.map((b) => (
                <tr key={b.id} className="hover:bg-customLightBlue/10">
                  <td className={`${tdStyleBase} font-medium`}>{b.title}</td>
                  <td className={`${tdStyleBase} font-mono uppercase`}>
                    {b.code}
                  </td>
                  <td className={`${tdStyleBase} whitespace-nowrap text-right`}>
                    <Button
                      onClick={() => handleEdit(b)}
                      disabled={isPending}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                      title="Edit Branch"
                    >
                      <Edit3 size={16} />
                    </Button>
                    <Button
                      onClick={() => handleDeleteClick(b)}
                      disabled={isPending}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                      title="Delete Branch"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBranch ? "Edit Branch" : "Add New Branch"}
            </DialogTitle>
            <DialogDescription>
              {editingBranch
                ? "Update the branch information below."
                : "Fill in the form below to create a new branch."}
            </DialogDescription>
          </DialogHeader>
          {error && isModalOpen && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <form
            ref={formRef}
            onSubmit={(e) => e.preventDefault()}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="title">
                Branch Title <span className="text-red-500">*</span>
              </Label>
              <Input
                type="text"
                name="title"
                id="title"
                required
                defaultValue={editingBranch?.title ?? ""}
                disabled={isSaving}
              />
            </div>
            <div>
              <Label htmlFor="code">
                Branch Code {!editingBranch && <span className="text-red-500">*</span>}
              </Label>
              <Input
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
                className="font-mono uppercase tracking-widest"
                readOnly={!!editingBranch}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {editingBranch
                  ? "Code cannot be changed after creation."
                  : "Exactly 6 uppercase characters or numbers."}
              </p>
            </div>
          </form>
          <DialogFooter>
            <Button
              type="button"
              onClick={closeModal}
              disabled={isSaving}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : editingBranch ? (
                "Save Changes"
              ) : (
                "Create Branch"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setDeleteDialogOpen(false);
          setPendingDeleteBranchId(null);
          setPendingDeleteBranchTitle(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Branch</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the branch{" "}
              <span className="font-semibold">{pendingDeleteBranchTitle}</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setPendingDeleteBranchId(null);
                setPendingDeleteBranchTitle(null);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Branch
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

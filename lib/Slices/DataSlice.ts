import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
// Import NEW server actions
import {
  getAllServicesOnly,
  getAllServiceSets,
  getAllBranches, // Assuming you have this server action
} from "@/lib/ServerAction";
// Import Prisma types directly
import type {
  Service as PrismaService,
  ServiceSet as PrismaServiceSet,
  Branch as PrismaBranch, // Import Branch type
} from "@prisma/client";

// Define state structure
interface DataState {
  services: PrismaService[] | null;
  serviceSets: PrismaServiceSet[] | null;
  branches: PrismaBranch[] | null; // Add branches state
  itemsLoading: boolean; // Combined loading for services/sets
  branchesLoading: boolean; // Specific loading for branches
  itemsError: string | null;
  branchesError: string | null; // Specific error for branches
}

const initialState: DataState = {
  services: null,
  serviceSets: null,
  branches: null,
  itemsLoading: false,
  branchesLoading: false,
  itemsError: null,
  branchesError: null,
};

// Thunk to fetch Services ONLY
export const fetchServices = createAsyncThunk(
  "data/fetchServices",
  async (_, { getState, rejectWithValue }) => {
    const state = getState() as { data: DataState };
    if (state.data.services && state.data.services.length > 0) {
      // Data already exists, don't re-fetch unless explicitly needed
      // console.log("Services already in store, skipping fetch.");
      // return state.data.services; // Optionally return existing data
    }
    console.log("Fetching services...");
    try {
      const fetchedServices = await getAllServicesOnly();
      return fetchedServices;
    } catch (error: any) {
      console.error("Failed to fetch services:", error);
      return rejectWithValue(error.message || "Failed to load services.");
    }
  },
);

// Thunk to fetch Service Sets ONLY
export const fetchServiceSets = createAsyncThunk(
  "data/fetchServiceSets",
  async (_, { getState, rejectWithValue }) => {
    const state = getState() as { data: DataState };
    if (state.data.serviceSets && state.data.serviceSets.length > 0) {
      // console.log("Service sets already in store, skipping fetch.");
      // return state.data.serviceSets;
    }
    console.log("Fetching service sets...");
    try {
      const fetchedServiceSets = await getAllServiceSets();
      return fetchedServiceSets;
    } catch (error: any) {
      console.error("Failed to fetch service sets:", error);
      return rejectWithValue(error.message || "Failed to load service sets.");
    }
  },
);

// Thunk to fetch Branches
export const fetchBranches = createAsyncThunk(
  "data/fetchBranches",
  async (_, { getState, rejectWithValue }) => {
    const state = getState() as { data: DataState };
    if (state.data.branches && state.data.branches.length > 0) {
      // console.log("Branches already in store, skipping fetch.");
      // return state.data.branches;
    }
    console.log("Fetching branches...");
    try {
      const fetchedBranches = await getAllBranches(); // Use your server action
      return fetchedBranches;
    } catch (error: any) {
      console.error("Failed to fetch branches:", error);
      return rejectWithValue(error.message || "Failed to load branches.");
    }
  },
);

// Create the slice
export const DataSlice = createSlice({
  name: "data",
  initialState,
  reducers: {
    clearAllData: (state) => {
      state.services = null;
      state.serviceSets = null;
      state.branches = null; // Clear branches too
      state.itemsLoading = false;
      state.branchesLoading = false;
      state.itemsError = null;
      state.branchesError = null;
    },
    // You can add more specific reducers if needed
  },
  extraReducers: (builder) => {
    // Handle fetchServices
    builder
      .addCase(fetchServices.pending, (state) => {
        state.itemsLoading = true;
        state.itemsError = null;
      })
      .addCase(
        fetchServices.fulfilled,
        (state, action: PayloadAction<PrismaService[]>) => {
          state.itemsLoading = false;
          state.services = action.payload;
          state.itemsError = null;
        },
      )
      .addCase(fetchServices.rejected, (state, action) => {
        state.itemsLoading = false;
        state.itemsError =
          (action.payload as string) ?? "Failed to fetch services";
        state.services = null;
      });

    // Handle fetchServiceSets
    builder
      .addCase(fetchServiceSets.pending, (state) => {
        state.itemsLoading = true; // Can use the same itemsLoading or a separate one
        state.itemsError = null;
      })
      .addCase(
        fetchServiceSets.fulfilled,
        (state, action: PayloadAction<PrismaServiceSet[]>) => {
          state.itemsLoading = false;
          state.serviceSets = action.payload;
          state.itemsError = null;
        },
      )
      .addCase(fetchServiceSets.rejected, (state, action) => {
        state.itemsLoading = false;
        state.itemsError =
          (action.payload as string) ?? "Failed to fetch service sets";
        state.serviceSets = null;
      });

    // Handle fetchBranches
    builder
      .addCase(fetchBranches.pending, (state) => {
        state.branchesLoading = true;
        state.branchesError = null;
      })
      .addCase(
        fetchBranches.fulfilled,
        (state, action: PayloadAction<PrismaBranch[]>) => {
          state.branchesLoading = false;
          state.branches = action.payload;
          state.branchesError = null;
        },
      )
      .addCase(fetchBranches.rejected, (state, action) => {
        state.branchesLoading = false;
        state.branchesError =
          (action.payload as string) ?? "Failed to fetch branches";
        state.branches = null;
      });
  },
});

export const { clearAllData } = DataSlice.actions;
export default DataSlice.reducer;

// lib/Slices/DataSlice.ts
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
// Import NEW server actions
import { getAllServicesOnly, getAllServiceSets } from "@/lib/ServerAction";
// Import Prisma types directly if needed, or use simplified types
import type {
  Service as PrismaService,
  ServiceSet as PrismaServiceSet,
} from "@prisma/client";
// Import your central FetchedItem type - MAKE SURE IT'S CORRECT
import { FetchedItem } from "../Types";

// Define state structure
interface DataState {
  services: PrismaService[] | null; // Store raw services
  serviceSets: PrismaServiceSet[] | null; // Store raw service sets
  itemsLoading: boolean; // Single loading state for simplicity, or separate ones
  itemsError: string | null;
  // Removed itemsFetchedForAccountID as we're fetching globally now
}

const initialState: DataState = {
  services: null,
  serviceSets: null,
  itemsLoading: false, // Start as false
  itemsError: null,
};

// Thunk to fetch Services ONLY
export const fetchServices = createAsyncThunk(
  "data/fetchServices",
  async (_, { rejectWithValue }) => {
    // No accountID needed now
    console.log("Fetching services...");
    try {
      const fetchedServices = await getAllServicesOnly();
      return fetchedServices; // Return raw PrismaService array
    } catch (error: any) {
      console.error("Failed to fetch services:", error);
      return rejectWithValue(error.message || "Failed to load services.");
    }
  },
);

// Thunk to fetch Service Sets ONLY
export const fetchServiceSets = createAsyncThunk(
  "data/fetchServiceSets",
  async (_, { rejectWithValue }) => {
    console.log("Fetching service sets...");
    try {
      const fetchedServiceSets = await getAllServiceSets();
      return fetchedServiceSets; // Return raw PrismaServiceSet array
    } catch (error: any) {
      console.error("Failed to fetch service sets:", error);
      return rejectWithValue(error.message || "Failed to load service sets.");
    }
  },
);

// Create the slice
export const DataSlice = createSlice({
  name: "data",
  initialState,
  reducers: {
    clearAllData: (state) => {
      // Clear both lists
      state.services = null;
      state.serviceSets = null;
      state.itemsLoading = false;
      state.itemsError = null;
    },
  },
  extraReducers: (builder) => {
    // Handle fetchServices
    builder
      .addCase(fetchServices.pending, (state) => {
        state.itemsLoading = true; // Use combined loading state
        state.itemsError = null;
      })
      .addCase(fetchServices.fulfilled, (state, action) => {
        state.itemsLoading = false;
        state.services = action.payload; // Store services
        state.itemsError = null;
      })
      .addCase(fetchServices.rejected, (state, action) => {
        state.itemsLoading = false;
        state.itemsError =
          (action.payload as string) ?? "Failed to fetch services";
        state.services = null; // Clear on error
      });

    // Handle fetchServiceSets
    builder
      .addCase(fetchServiceSets.pending, (state) => {
        state.itemsLoading = true; // Use combined loading state
        state.itemsError = null;
      })
      .addCase(fetchServiceSets.fulfilled, (state, action) => {
        state.itemsLoading = false;
        state.serviceSets = action.payload; // Store service sets
        state.itemsError = null;
      })
      .addCase(fetchServiceSets.rejected, (state, action) => {
        state.itemsLoading = false;
        state.itemsError =
          (action.payload as string) ?? "Failed to fetch service sets";
        state.serviceSets = null; // Clear on error
      });
  },
});

export const { clearAllData } = DataSlice.actions; // Export renamed action
export default DataSlice.reducer;

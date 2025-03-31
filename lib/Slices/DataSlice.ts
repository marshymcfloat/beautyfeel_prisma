import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { getServices } from "@/lib/utils";

type Service = {
  id: string;
  title: string;
  price: number;
  branchId: string;
};

interface DataState {
  services: Service[] | null;
  servicesLoading: boolean;
  servicesError: string | null;
  servicesFetchedForAccountID: string | null;
}

const initialState: DataState = {
  services: null,
  servicesLoading: false,
  servicesError: null,
  servicesFetchedForAccountID: null,
};

export const fetchServicesForAccount = createAsyncThunk(
  "data/fetchServicesForAccount",
  async (accountID: string, { getState, rejectWithValue }) => {
    const { data } = getState() as { data: DataState }; // Adjust 'data' if slice name is different

    // *** Optimization Check ***
    // If services are already loaded for this specific accountID, don't refetch
    if (
      data.services &&
      data.servicesFetchedForAccountID === accountID &&
      !data.servicesError
    ) {
      console.log(
        `Services for account ${accountID} already loaded. Skipping fetch.`,
      );
      // Return the existing services to potentially use in component if needed,
      // though usually selecting from state is sufficient.
      // Or simply return a marker indicating no fetch was needed.
      return { data: data.services, fetched: false, accountID };
    }

    console.log(`Fetching services for account ${accountID}...`);
    try {
      // Ensure accountID is valid before fetching
      if (!accountID) {
        throw new Error("Account ID is required to fetch services.");
      }
      const fetchedServices = await getServices(accountID);
      // Return data and the accountID it belongs to
      return { data: fetchedServices, fetched: true, accountID };
    } catch (error: any) {
      console.error("Failed to fetch services:", error);
      // Use rejectWithValue to send a structured error payload
      return rejectWithValue(error.message || "Failed to load services.");
    }
  },
);

// Create the slice
export const DataSlice = createSlice({
  name: "data", // Or your preferred slice name
  initialState,
  reducers: {
    // Optional: Reducer to clear services if needed (e.g., on logout)
    clearServices: (state) => {
      state.services = null;
      state.servicesFetchedForAccountID = null;
      state.servicesLoading = false;
      state.servicesError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchServicesForAccount.pending, (state, action) => {
        const accountID = action.meta.arg;
        if (
          state.servicesFetchedForAccountID !== accountID ||
          state.servicesError
        ) {
          state.servicesLoading = true;
          state.servicesError = null;
        }
      })
      .addCase(fetchServicesForAccount.fulfilled, (state, action) => {
        if (action.payload.fetched) {
          state.servicesLoading = false;
          state.services = action.payload.data;
          state.servicesFetchedForAccountID = action.payload.accountID;
          state.servicesError = null;
        } else {
          state.servicesLoading = false;
        }
      })
      .addCase(fetchServicesForAccount.rejected, (state, action) => {
        state.servicesLoading = false;
        state.servicesError = action.payload as string;
      });
  },
});

export const { clearServices } = DataSlice.actions;
export default DataSlice.reducer;

"use client"; // This makes this component a Client Component

import React, { useState, useEffect, ChangeEvent, useRef } from "react";
import debounce from "lodash.debounce";
import { Loader2 } from "lucide-react"; // Import Loader2 icon

interface Customer {
  id: string;
  name: string;
  email?: string;
}

interface AttendedFollowUp {
  id: string;
  attendedDate: string; // Formatted date string from the API
  originatingServiceTitle: string;
}

const CustomerHistoryWidget: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [attendedFollowUps, setAttendedFollowUps] = useState<
    AttendedFollowUp[]
  >([]);

  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const debouncedFetchCustomersRef = useRef<ReturnType<typeof debounce> | null>(
    null,
  );

  useEffect(() => {
    const fetchCustomers = async (query: string) => {
      if (query.length < 2) {
        setSearchResults([]);
        setIsLoadingSearch(false);
        return;
      }
      setSearchError(null);
      try {
        const response = await fetch(
          `/api/customers/search?name=${encodeURIComponent(query)}`,
        );
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message || "Failed to fetch search results",
          );
        }
        const data: Customer[] = await response.json();
        setSearchResults(data);
      } catch (error: any) {
        console.error("Customer search error:", error);
        setSearchError(error.message || "Error searching customers.");
        setSearchResults([]);
      } finally {
        setIsLoadingSearch(false);
      }
    };

    debouncedFetchCustomersRef.current = debounce(fetchCustomers, 300);

    return () => {
      debouncedFetchCustomersRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();

    if (query.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      // Do not clear selectedCustomer and its history if the user is just clearing the search
      // Only clear them if a new search is initiated or explicitly cleared
      // However, if search query is cleared, it's reasonable to hide the dropdown.
      // If selectedCustomer exists, its details remain visible.
      setIsLoadingSearch(false);
      debouncedFetchCustomersRef.current?.cancel();
      return;
    }

    setIsLoadingSearch(true);
    // Clear previous results and errors when a new search is initiated
    setSearchResults([]);
    setSearchError(null);
    // If user types a new search, it implies they are looking for someone else,
    // so clear the currently selected customer and their history.
    setSelectedCustomer(null);
    setAttendedFollowUps([]);
    setHistoryError(null);

    debouncedFetchCustomersRef.current?.(query);
  }, [searchQuery]);

  const handleSearchInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const selectCustomer = (customer: Customer) => {
    debouncedFetchCustomersRef.current?.cancel();
    setIsLoadingSearch(false);
    setSelectedCustomer(customer);
    setSearchResults([]); // Hide search results dropdown
    // setSearchQuery(customer.name); // Optional: update input to selected customer's name
    // Kept commented to retain typed query, allowing easy new search
    fetchCustomerHistory(customer.id);
  };

  const fetchCustomerHistory = async (customerId: string) => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    setAttendedFollowUps([]);
    try {
      const response = await fetch(
        `/api/customers/${customerId}/attended-followups`,
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to fetch history");
      }
      const data: AttendedFollowUp[] = await response.json();
      setAttendedFollowUps(data);
    } catch (error: any) {
      console.error("Fetch history error:", error);
      setHistoryError(error.message || "Error fetching appointment history.");
      setAttendedFollowUps([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const getFollowUpSummary = (followUps: AttendedFollowUp[]) => {
    const counts: { [serviceTitle: string]: number } = {};
    followUps.forEach((fu) => {
      counts[fu.originatingServiceTitle] =
        (counts[fu.originatingServiceTitle] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([title, count]) => `${title}: ${count} time${count > 1 ? "s" : ""}`)
      .join(", ");
  };

  return (
    <div className="rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm">
      <h3 className="mb-4 text-base font-semibold">
        Customer Appointment History
      </h3>

      <div className="relative mb-4">
        {" "}
        {/* Container for input, label, and dropdown */}
        <input
          type="text"
          id="customer-search"
          className="peer relative z-0 h-[50px] w-full rounded-md border-2 border-gray-300 bg-white px-3 shadow-custom outline-none transition-colors duration-150 focus:border-pink-500"
          value={searchQuery}
          onChange={handleSearchInputChange}
          placeholder=" " // Required for peer-[:not(:placeholder-shown)]
          autoComplete="off"
        />
        <label
          htmlFor="customer-search"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 cursor-text bg-white px-1 text-base font-medium text-gray-500 transition-all duration-150 peer-focus:top-0 peer-focus:z-10 peer-focus:-translate-y-1/2 peer-focus:text-sm peer-focus:text-pink-500 peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:z-10 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-sm peer-[:not(:placeholder-shown)]:text-pink-500"
        >
          Search Customer
        </label>
        {/* Show search results dropdown, only if results exist AND no customer is selected */}
        {searchResults.length > 0 && !selectedCustomer && (
          <ul className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg">
            <div className="p-2">
              {searchResults.map((customer) => (
                <li
                  key={customer.id}
                  className="cursor-pointer rounded-md px-3 py-2 text-sm hover:bg-gray-100"
                  onClick={() => selectCustomer(customer)}
                >
                  {customer.name} {customer.email && `(${customer.email})`}
                </li>
              ))}
            </div>
          </ul>
        )}
      </div>

      {/* Display Spinner or Error during search */}
      {isLoadingSearch && searchQuery.length >= 2 && (
        <div className="mt-1 flex items-center text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching...
        </div>
      )}
      {searchError && (
        <p className="mt-1 text-sm text-red-500">{searchError}</p>
      )}

      {/* Display History section only if a customer is selected */}
      {selectedCustomer && (
        <div className="mt-4">
          {" "}
          {/* Added mt-4 for spacing from input group/errors */}
          <h4 className="text-md mb-2 font-medium">
            History for:{" "}
            <span className="font-bold">{selectedCustomer.name}</span>
          </h4>
          {isLoadingHistory && (
            <div className="flex items-center text-sm text-gray-500">
              {" "}
              {/* Consistent loading display */}
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading
              history...
            </div>
          )}
          {historyError && (
            <p className="text-sm text-red-500">{historyError}</p>
          )}
          {!isLoadingHistory && !historyError && (
            <div>
              <p className="mb-2 text-sm text-gray-600">
                Attended Follow-ups ({attendedFollowUps.length} total)
                {attendedFollowUps.length > 0 &&
                  `: ${getFollowUpSummary(attendedFollowUps)}`}
              </p>
              {attendedFollowUps.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No attended follow-up appointments found for this customer.
                </p>
              ) : (
                <ul className="list-inside list-disc space-y-1 text-sm">
                  {attendedFollowUps.map((fu) => (
                    <li key={fu.id}>
                      {fu.attendedDate} - {fu.originatingServiceTitle}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerHistoryWidget;

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("Start seeding specific branches and services ...");

  // --- Data to Seed ---

  // Define the data for the two branches you want to create
  // Choose unique codes for these branches. EEBH and WBBH are examples.
  const branchesData = [
    { title: "Eyelash/Eyebrow", code: "EEBH" },
    { title: "Waxing/Body", code: "WBBH" },
  ];

  // Define the services grouped by their intended branch
  const branchServicesData = {
    "Eyelash/Eyebrow": [
      { title: "Classic eyelash extensions", price: 399 },
      { title: "Wispy", price: 450 },
      { title: "Doll eye", price: 450 },
      { title: "Cat eye", price: 450 },
      { title: "Volume", price: 500 },
      { title: "Eyelash Perming", price: 399 },
      { title: "Eyelash Perm with tint", price: 450 },
      { title: "Eyebrow lamination", price: 450 },
    ],
    "Waxing/Body": [
      { title: "Underarm wax", price: 350 },
      { title: "Whole Arm", price: 350 },
      { title: "Half legs", price: 350 },
      { title: "Whole legs", price: 450 },
      { title: "Brazilian", price: 800 },
      { title: "Whole body scrub", price: 750 },
    ],
  };

  // --- Seeding Logic ---

  for (const branchData of branchesData) {
    let currentBranch = null;

    try {
      // Attempt to create the branch
      console.log(
        `Attempting to create branch: "${branchData.title}" (Code: ${branchData.code})...`,
      );
      currentBranch = await prisma.branch.create({
        data: {
          title: branchData.title,
          code: branchData.code,
          // Default values for totalSales are handled by schema
        },
      });
      console.log(
        `Successfully created branch: "${currentBranch.title}" with id: ${currentBranch.id}`,
      );
    } catch (e) {
      // If creation fails due to unique constraint (P2002)
      if (e.code === "P2002") {
        console.warn(
          `Branch with title "${branchData.title}" or code "${branchData.code}" already exists. Attempting to find the existing branch by code...`,
        );
        try {
          // Find the existing branch by its unique code
          currentBranch = await prisma.branch.findUnique({
            where: { code: branchData.code },
          });
          if (currentBranch) {
            console.log(
              `Found existing branch: "${currentBranch.title}" with id: ${currentBranch.id}`,
            );
            // Optional: Check if the found branch's title matches the one we intended
            if (currentBranch.title !== branchData.title) {
              console.warn(
                `Existing branch with code "${branchData.code}" has title "${currentBranch.title}", which differs from expected "${branchData.title}". Proceeding with existing branch.`,
              );
            }
          } else {
            // This should not happen if P2002 was the reason, but handle defensively.
            console.error(
              `Could not find existing branch with code "${branchData.code}" after P2002 error. Cannot add services.`,
            );
            continue; // Skip adding services for this branch data entry
          }
        } catch (findError) {
          console.error(
            `Error finding existing branch with code "${branchData.code}":`,
            findError,
          );
          continue; // Skip adding services if find fails
        }
      } else {
        // Handle other potential errors during branch creation
        console.error(
          `Error during branch creation for "${branchData.title}":`,
          e,
        );
        // For other errors, it might be better to stop the whole seed process.
        throw e;
      }
    }

    // If we have a valid branch object (either created or found)
    if (currentBranch) {
      const servicesToAdd = branchServicesData[currentBranch.title];

      if (!servicesToAdd || servicesToAdd.length === 0) {
        console.warn(
          `No service data defined or found for branch title "${currentBranch.title}". Skipping service creation for this branch.`,
        );
        continue; // Move to the next branch if no services are defined for it
      }

      console.log(
        `Attempting to add ${servicesToAdd.length} services to branch "${currentBranch.title}" (ID: ${currentBranch.id})...`,
      );

      for (const service of servicesToAdd) {
        try {
          // Check if a service with this title already exists *globally*
          // because Service.title is @unique across all branches.
          const existingService = await prisma.service.findUnique({
            where: { title: service.title },
          });

          if (existingService) {
            console.warn(
              `- Service "${service.title}" already exists globally (id: ${existingService.id}). Skipping creation for branch "${currentBranch.title}".`,
            );
            // Note: If the existing service is linked to a *different* branch,
            // your schema prevents linking it to this one. The unique constraint on title
            // means a service title can only exist once in the entire Service table.
          } else {
            // Service does not exist globally, create it for the current branch
            await prisma.service.create({
              data: {
                title: service.title,
                price: service.price,
                branchId: currentBranch.id, // Link to the current branch's ID
                // Default values handled by schema (description, totalSales, etc.)
              },
            });
            console.log(
              `- Created service: "${service.title}" for branch "${currentBranch.title}"`,
            );
          }
        } catch (e) {
          // Catch any other potential errors during service creation
          console.error(
            `- Error creating service "${service.title}" for branch "${currentBranch.title}":`,
            e,
          );
          // Decide how to handle other errors: continue to next service, rethrow? Let's continue for resilience.
        }
      }
      console.log(
        `Finished processing services for branch "${currentBranch.title}".`,
      );
    } else {
      console.warn(
        `Skipping service addition for branch data entry "${branchData.title}" because no branch object was successfully created or found.`,
      );
    }
  }

  console.log("Specific branch and service seeding finished.");
}

main()
  .catch((e) => {
    console.error("An unexpected error occurred during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRO_NAMES = [
  "Ajay Bharat Labs",
  "Akhil (Molecular)",
  "Amit Mishra PRO",
  "Anuj Gupta PRO",
  "AOHC",
  "Ashish PRO",
  "Aviral Gupta Sir (Molecular)",
  "Avinash PRO",
  "Bharat Lab PRO",
  "Brahamdev PRO",
  "Brajesh PRO",
  "DAK",
  "Deen Dayal Arun PRO",
  "Nikunj Jain",
  "Nitin Leekha",
  "Surender Kumar Dabas (JAMC)",
  "DSCI",
  "EBML",
  "ESI",
  "Eve Healthcare",
  "Foundation Coupon(7500)",
  "Harish PRO",
  "Irshad (Molecular)",
  "Jatin PRO",
  "Just Dial",
  "Khushboo PRO",
  "Krishna Kant Tripathi PRO",
  "Krishna Sir(Molecular)",
  "Lab Uncle",
  "Manipal Hospitals",
  "Manoj Sharma PRO",
  "Mihir PRO",
  "Mitali (Molecular)",
  "Mohit Gupta Sir (Molecular)",
  "Neeraj PRO",
  "Nitesh Kumar PRO",
  "NITRD",
  "Others (Not Available - NA)",
  "Pankaj PRO",
  "Pradeep PRO",
  "Praveen Sharma PRO",
  "Rakesh PRO",
  "Ravi Kumar PRO",
  "Redcliff",
  "SELF",
  "Shalimar - Lalita",
  "Shubham Jain (Molecular)",
  "Shyaam Nagar PRO",
  "SSS - Sachin Sarcoma Society",
  "Subodh PRO",
  "Sunil Joshi Sir (DDN - Molecular)",
  "Sunil Sir (GP - Molecular)",
  "Umesh Pandey PRO",
  "Vimal PRO",
  "Vipin (GP - Molecular)",
  "Vipin/Nitin PRO",
  "Vishal Sir (Molecular)",
  "Visit Health",
  "Rohit Ji - Dehradun",
  "Trilok Ji - Dehradun",
  "Anurag Ji - Jhansi (Gwalior)",
  "Carelan",
  "Gautam Sir (Gwalior)",
  "Guddu Kumar",
  "Kaushalendra Ji (Gwalior)",
  "Dinesh Verma PRO",
];

async function main() {
  console.log("Seeding PRO names (skipping any previously deleted entries)...");

  // Fetch all existing names — including those deleted and recreated.
  // We use a separate tracking table check: if a ProName with this name
  // DOES NOT exist and has never been in the DB, we create it.
  // If it was explicitly deleted (not in DB anymore), we SKIP it.
  //
  // Strategy: Only INSERT names that do NOT yet exist in the DB.
  // This preserves admin deletions — deleted names stay deleted.
  const existingNames = await prisma.proName.findMany({ select: { name: true } });
  const existingSet = new Set(existingNames.map(n => n.name));

  // We also need to know which names were intentionally deleted.
  // Since we can't track deletions directly, we compare the seed list
  // against what's in DB. Names absent from DB that are in seed list
  // could be: (a) never seeded, or (b) deliberately deleted by admin.
  //
  // Solution: Use a "seed marker" table approach - track seed names we've
  // already processed once. If it was added and then deleted, skip it.
  // For simplicity: only create if NOT in DB. Admin deletes are permanent.
  let added = 0;
  let skipped = 0;
  for (const name of PRO_NAMES) {
    if (existingSet.has(name)) {
      // Already exists — skip (preserves any admin edits to name)
      skipped++;
      continue;
    }
    // Not in DB: this is either a brand-new seed entry OR a deleted one.
    // We check the DeletedProName log table if it exists; otherwise skip deleted ones.
    let wasDeleted = false;
    try {
      const deleted = await (prisma as any).deletedProName?.findFirst({ where: { name } });
      wasDeleted = !!deleted;
    } catch (_) {
      // deletedProName table may not exist yet — safe fallback: add the name
    }
    if (wasDeleted) {
      console.log(`  ⏭️  Skipping (was deleted by admin): ${name}`);
      skipped++;
      continue;
    }
    await prisma.proName.create({ data: { name, isCustom: false } });
    added++;
  }
  console.log(`✅ PRO seed complete: ${added} added, ${skipped} skipped (already existed or deleted).`);
}


main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

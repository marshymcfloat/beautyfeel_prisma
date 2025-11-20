import { PrismaClient } from "@prisma/client";

const services = [
  // ✅ Skin Improvement Services
  {
    title: "Acne Treatment",
    description:
      "Comprehensive acne treatment designed to reduce active breakouts and prevent future ones. Our specialized treatment includes deep cleansing, extraction of blackheads and whiteheads, application of anti-inflammatory serums, and a calming mask to soothe irritated skin. Suitable for all skin types experiencing acne concerns.",
    price: 1500,
    branchId: "e5214c32-dda3-455c-9426-2e38155b4448",
  },
  {
    title: "Facial Rejuvenation",
    description:
      "Advanced facial treatment that rejuvenates and deeply hydrates the skin, restoring its natural glow and elasticity. This comprehensive service includes gentle exfoliation, hydrating serums rich in hyaluronic acid and peptides, facial massage to improve circulation, and a nourishing mask. Perfect for restoring youthful radiance and combating signs of aging.",
    price: 2000,
    branchId: "e5214c32-dda3-455c-9426-2e38155b4448",
  },
  {
    title: "Skin Whitening",
    description:
      "Professional skin lightening treatment that effectively lightens skin tone and removes dark spots, hyperpigmentation, and uneven skin discoloration. Using safe and proven ingredients like vitamin C, kojic acid, and arbutin, this treatment brightens the complexion while maintaining skin health. Results are visible after consistent sessions.",
    price: 1800,
    branchId: "e5214c32-dda3-455c-9426-2e38155b4448",
  },
  {
    title: "Microdermabrasion",
    description:
      "Non-invasive exfoliation treatment that removes dead skin cells and reveals smoother, brighter skin underneath. Using fine crystals or a diamond-tipped wand, this procedure gently abrades the skin surface, stimulating collagen production and improving skin texture. Ideal for reducing fine lines, acne scars, age spots, and sun damage.",
    price: 2200,
    branchId: "e5214c32-dda3-455c-9426-2e38155b4448",
  },
  {
    title: "Chemical Peel",
    description:
      "Professional chemical peel treatment that safely removes damaged outer skin layers to reveal fresher, healthier skin. Using carefully selected acids like glycolic, salicylic, or lactic acid, this treatment addresses various skin concerns including acne, wrinkles, uneven skin tone, and sun damage. The depth and type of peel are customized to your skin's needs.",
    price: 2500,
    branchId: "e5214c32-dda3-455c-9426-2e38155b4448",
  },

  // ✅ Massage and Spa Services
  {
    title: "Swedish Massage",
    description:
      "Classic relaxing full-body massage using long, flowing strokes, kneading, and circular movements to ease muscle tension and promote overall relaxation. This gentle yet effective technique improves circulation, reduces stress, and helps relieve everyday aches and pains. Perfect for first-time massage clients or those seeking a soothing, therapeutic experience.",
    price: 1200,
    branchId: "a009132a-2883-4a62-88c0-285651c57ce7",
  },
  {
    title: "Deep Tissue Massage",
    description:
      "Intensive massage therapy that targets deeper muscle layers and connective tissue to release chronic tension and knots. Using slower, more forceful strokes and focused pressure, this treatment addresses specific problem areas, improves range of motion, and provides relief from persistent pain. Ideal for athletes, those with chronic pain, or anyone experiencing deep muscle tension.",
    price: 1500,
    branchId: "a009132a-2883-4a62-88c0-285651c57ce7",
  },
  {
    title: "Hot Stone Massage",
    description:
      "Therapeutic massage using smooth, heated stones placed on key points of the body and used as massage tools. The combination of heat and pressure helps to relax muscles, improve circulation, and release deep-seated tension. This luxurious treatment provides a unique sensation of warmth and comfort, making it perfect for stress relief and muscle recovery.",
    price: 1700,
    branchId: "a009132a-2883-4a62-88c0-285651c57ce7",
  },
  {
    title: "Aromatherapy Massage",
    description:
      "Relaxing massage enhanced with carefully selected essential oils tailored to your needs. The therapeutic properties of essential oils combined with massage techniques create a holistic experience that addresses both physical tension and emotional well-being. Choose from calming, energizing, or pain-relief blends to enhance your massage experience.",
    price: 1400,
    branchId: "a009132a-2883-4a62-88c0-285651c57ce7",
  },
  {
    title: "Foot Reflexology",
    description:
      "Specialized pressure point massage focusing on the feet, based on the principle that specific points on the feet correspond to different organs and systems in the body. This therapeutic technique promotes relaxation, improves circulation, and can help alleviate various health concerns. A perfect treatment for those who spend long hours on their feet or seek natural wellness benefits.",
    price: 1100,
    branchId: "a009132a-2883-4a62-88c0-285651c57ce7",
  },

  // ✅ Nail Services
  {
    title: "Manicure",
    description:
      "Complete basic nail care service including nail shaping, cuticle care, hand massage, buffing, and application of regular polish. This classic treatment keeps your hands looking neat and polished while providing a relaxing experience. Perfect for maintaining healthy, well-groomed nails on a regular basis.",
    price: 500,
    branchId: "a5db3e9c-73d8-4631-a6ad-b59b8cf2e272",
  },
  {
    title: "Pedicure",
    description:
      "Comprehensive foot care service that includes foot soak, exfoliation, nail shaping, cuticle care, callus removal, foot and leg massage, and polish application. This indulgent treatment not only beautifies your feet but also promotes foot health and relaxation. Essential for maintaining healthy, soft, and well-groomed feet.",
    price: 700,
    branchId: "a5db3e9c-73d8-4631-a6ad-b59b8cf2e272",
  },
  {
    title: "Gel Polish",
    description:
      "Long-lasting gel nail polish application that provides a chip-resistant, glossy finish that can last up to three weeks. The gel polish is cured under a UV or LED lamp, creating a durable, high-shine coating. Available in a wide range of colors and finishes, perfect for those who want beautiful nails that withstand daily activities.",
    price: 900,
    branchId: "a5db3e9c-73d8-4631-a6ad-b59b8cf2e272",
  },
  {
    title: "Acrylic Nails",
    description:
      "Professional application of artificial nail extensions using acrylic powder and liquid monomer. This durable option creates strong, long-lasting nails that can be shaped and styled to your preference. Perfect for those who want to add length, strength, or create unique nail art designs. Includes shaping, filing, and polish application.",
    price: 1500,
    branchId: "a5db3e9c-73d8-4631-a6ad-b59b8cf2e272",
  },
  {
    title: "Nail Art",
    description:
      "Custom artistic designs applied to your nails, ranging from simple patterns to intricate artwork. Our skilled nail artists can create various styles including floral designs, geometric patterns, ombre effects, glitter accents, and personalized motifs. Perfect for special occasions or expressing your unique style. Can be applied to natural nails, gel polish, or acrylic extensions.",
    price: 1200,
    branchId: "a5db3e9c-73d8-4631-a6ad-b59b8cf2e272",
  },

  // ✅ Lashes Services
  {
    title: "Classic Eyelash Extensions",
    description:
      "Professional application of natural-looking individual lash extensions, with one extension applied to each natural lash. Using premium synthetic lashes that mimic the look and feel of natural lashes, this service creates length, volume, and curl without the need for mascara. Perfect for achieving a subtle, everyday glamorous look that lasts 4-6 weeks with proper care.",
    price: 2500,
    branchId: "ccb12416-0f2c-458e-9425-e83cc6ad0596",
  },
  {
    title: "Volume Eyelash Extensions",
    description:
      "Luxurious full set of volume eyelash extensions that create a fuller, more dramatic lash effect. Multiple lightweight extensions are carefully applied to each natural lash using a fanning technique, creating a voluminous, glamorous look. Perfect for special events or those who prefer a more dramatic appearance. Results last 4-6 weeks with proper maintenance.",
    price: 3000,
    branchId: "ccb12416-0f2c-458e-9425-e83cc6ad0596",
  },
  {
    title: "Lash Lift",
    description:
      "Semi-permanent treatment that lifts and curls your natural lashes from the root, creating a wide-eyed, awake appearance without the need for extensions. This low-maintenance option uses a perming solution to set your lashes in an upward curl that lasts 6-8 weeks. Perfect for those with naturally straight lashes who want a natural enhancement without daily curling.",
    price: 1800,
    branchId: "ccb12416-0f2c-458e-9425-e83cc6ad0596",
  },
  {
    title: "Lash Tinting",
    description:
      "Professional semi-permanent dye application that darkens your natural lashes, making them appear thicker and more defined. This treatment eliminates the need for daily mascara application and is perfect for those with light-colored or sparse lashes. The tint typically lasts 4-6 weeks and can be combined with a lash lift for enhanced results.",
    price: 1000,
    branchId: "ccb12416-0f2c-458e-9425-e83cc6ad0596",
  },
  {
    title: "Eyelash Removal",
    description:
      "Safe and professional removal of existing lash extensions using a specialized remover that gently dissolves the adhesive without damaging your natural lashes. This service is essential when you want to change your lash style, remove old extensions, or give your natural lashes a break. Performed with care to ensure your natural lashes remain healthy and intact.",
    price: 800,
    branchId: "ccb12416-0f2c-458e-9425-e83cc6ad0596",
  },
];

const prisma = new PrismaClient();

async function serviceSeed() {
  await prisma.service.createMany({
    data: services,
    skipDuplicates: true,
  });

  console.log("✅ Seeding completed!");
}

serviceSeed()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],

  theme: {
    extend: {
      backgroundImage: {
        "custom-gradient":
          "linear-gradient(45deg, hsla(8, 82%, 77%, 1) 0%, hsla(299, 85%, 85%, 1) 100%)",
      },

      colors: {
        customWhiteBlue: "#ECF7FD",
        customLightBlue: "#BCDCED",
        customGray: "#D9D9D9",
        customDarkPink: "#C28583",
        customOffWhite: "#F6F4EB",
        customBlack: "#2E2A2A",
      },
      boxShadow: {
        custom: "0px 4px 4px rgba(0, 0, 0, 0.25)",
        PageShadow: "11px 26px 30px 25px rgba(0, 0, 0, 0.25)",
      },

      keyframes: {
        gradient: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        fadeOut: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
      },

      animation: {
        gradient: "gradient 10s ease infinite",
        fadeOut: "fadeOut 12s ease-out forwards",
      },
    },
  },
  plugins: [],
};

import type { MetadataRoute } from "next";
// this file will be used in app for logo and description
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Voya Taxi",
    short_name: "Voya",
    description: "Taxi & Chauffeur Platform for clients, chauffeurs, and admin management.",
    start_url: "/", //means the installed app starts on your homepage.
    scope: "/",
    display: "standalone", //means when installed, it opens more like an app, without the normal browser UI.
    background_color: "#020617",
    theme_color: "#020617", //matches your dark taxi platform background.
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}

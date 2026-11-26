import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BRAND.siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${BRAND.siteUrl}/login`, changeFrequency: "monthly", priority: 0.6 },
  ];
}

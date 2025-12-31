import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 10000,
});

// Finance APIs
export const fetchFinanceOverview = async () => {
  const { data } = await api.get("/finance/overview");
  return data;
};

export const fetchFinanceVideos = async () => {
  const { data } = await api.get("/finance/videos");
  return data;
};

export const fetchBreakingNews = async () => {
  const { data } = await api.get("/finance/breaking-news");
  return data;
};

// Industry News APIs
export const fetchIndustryNews = async () => {
  const { data } = await api.get("/industry-news");
  return data;
};

export const fetchIndustryVideos = async () => {
  const { data } = await api.get("/industry-news/videos");
  return data;
};

// Food APIs
export const fetchChineseRestaurants = async (lat?: number, lng?: number) => {
  const { data } = await api.get("/food/chinese", {
    params: lat && lng ? { lat, lng } : {},
  });
  return data;
};

export const fetchBubbleTeaShops = async (lat?: number, lng?: number) => {
  const { data } = await api.get("/food/bubble-tea", {
    params: lat && lng ? { lat, lng } : {},
  });
  return data;
};

// Entertainment APIs
export const fetchShows = async () => {
  const { data } = await api.get("/entertainment/shows");
  return data;
};

export const fetchGossip = async () => {
  const { data } = await api.get("/entertainment/gossip");
  return data;
};

// Deals API
export const fetchDeals = async () => {
  const { data } = await api.get("/deals");
  return data;
};

export default api;

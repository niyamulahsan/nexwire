import axios from "axios";

if (import.meta.env.VITE_API_URL) {
  axios.defaults.baseURL = import.meta.env.VITE_API_URL;
}

axios.defaults.withCredentials = true;
axios.defaults.headers.common["X-Requested-With"] = "XMLHttpRequest";
axios.defaults.headers.common.Accept = "application/json";

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const isAuthPage =
      window.location.pathname === "/register" ||
      window.location.pathname === "/login" ||
      window.location.pathname === "/forget-password" ||
      window.location.pathname === "/reset-password" ||
      window.location.pathname === "/verify-email";

    if (status === 401 && !isAuthPage) {
      const redirect = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
      window.location.href = `/login?redirect=${redirect}`;
    }

    return Promise.reject(error);
  }
);

export default axios;

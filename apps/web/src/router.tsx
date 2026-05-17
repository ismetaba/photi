import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { OrganizerLayout } from "./components/OrganizerLayout.js";
import { ParticipantLayout } from "./components/ParticipantLayout.js";
import Home from "./pages/organizer/Home.js";
import NewEvent from "./pages/organizer/NewEvent.js";
import EventDetail from "./pages/organizer/EventDetail.js";
import Billing from "./pages/organizer/Billing.js";
import EventLanding from "./pages/participant/EventLanding.js";
import Selfie from "./pages/participant/Selfie.js";
import Gallery from "./pages/participant/Gallery.js";
import Foyer from "./pages/participant/Foyer.js";

export const routes: RouteObject[] = [
  {
    element: <OrganizerLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/events/new", element: <NewEvent /> },
      { path: "/events/:id", element: <EventDetail /> },
      { path: "/billing", element: <Billing /> },
    ],
  },
  {
    element: <ParticipantLayout />,
    children: [
      { path: "/e/:slug", element: <EventLanding /> },
      { path: "/e/:slug/selfie", element: <Selfie /> },
      { path: "/e/:slug/gallery", element: <Gallery /> },
      { path: "/e/:slug/foyer", element: <Foyer /> },
    ],
  },
];

export const router = createBrowserRouter(routes);

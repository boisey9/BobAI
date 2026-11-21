export const workbenchSampleProjects = [
  {
    projectKey: "demo-rfq", id: "21e32958-2f3e-4362-8df1-73ecc921aa01",
    name: "Sample RFQ", repository: null,
  },
  {
    projectKey: "demo-bobai", id: "21e32958-2f3e-4362-8df1-73ecc921aa02",
    name: "Operations · Sample", repository: null,
  },
] as const;

export type WorkbenchSampleProject = typeof workbenchSampleProjects[number];

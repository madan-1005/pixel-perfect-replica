import { queryOptions } from "@tanstack/react-query";
import { getProject, listProjects } from "./media";

export const projectsQuery = () => queryOptions({ queryKey: ["projects"], queryFn: listProjects });
export const projectQuery = (id: string) => queryOptions({ queryKey: ["project", id], queryFn: () => getProject(id) });

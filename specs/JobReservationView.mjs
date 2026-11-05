export const title = "Job reservation";

export const state = (v) => {
  const jobs = Object.keys(v.status)
    .sort()
    .map((j) => {
      const phase = v.status[j];
      if (phase === "reserved") {
        return `${j} reserved`;
      }
      if (phase === "open") {
        return `${j} open`;
      }
      if (phase === "cancelled") {
        return `${j} cancelled`;
      }
      if (phase === "done") {
        return `${j} done`;
      }
      return `${j} absent`;
    });
  return jobs.join(" / ");
};

export const step = (action) => {
  if (action.startsWith("Create")) {
    return "tile tagged";
  }
  if (action.startsWith("Cancel")) {
    return "keeper untags";
  }
  if (action.startsWith("Recycle")) {
    return null;
  }
  if (action.startsWith("Reserve")) {
    return "worker reserves";
  }
  if (action.startsWith("Release")) {
    return "worker releases";
  }
  if (action.startsWith("Finish")) {
    return "worker finishes";
  }
  if (action.startsWith("Idle")) {
    return null;
  }
  return action;
};

export const group = (v) => {
  const phases = Object.values(v.status);
  if (phases.includes("reserved")) {
    return "reserved";
  }
  if (phases.includes("open")) {
    return "open";
  }
  if (phases.includes("cancelled")) {
    return "cancelled";
  }
  if (phases.includes("done")) {
    return "done";
  }
  return "empty";
};

export const colors = {
  empty: "tan",
  open: "blue",
  reserved: "teal",
  cancelled: "orange",
  done: "purple",
};

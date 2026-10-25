import { makeStyles, tokens } from "@fluentui/react-components";

export const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  row: {
    display: "flex",
    alignItems: "stretch",
    gap: tokens.spacingHorizontalM,
  },
  step: {
    minWidth: "64px",
    minHeight: "64px",
    fontSize: "28px",
  },
  input: {
    flex: 1,
    minWidth: 0,
    "& input": {
      textAlign: "center",
      fontSize: "32px",
      fontWeight: tokens.fontWeightSemibold,
      minHeight: "56px",
    },
  },
  hint: {
    color: tokens.colorNeutralForeground3,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
});

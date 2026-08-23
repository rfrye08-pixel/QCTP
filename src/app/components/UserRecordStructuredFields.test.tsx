import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UserRecordStructuredFields } from "./UserRecordStructuredFields";
import { sourceTrackReferenceFor } from "../../source-tracks";

afterEach(cleanup);

describe("UserRecordStructuredFields", () => {
  it("separates originating tool identity from user evidence fields", () => {
    const { container } = render(
      <dl>
        <UserRecordStructuredFields
          record={{
            contentRef: {
              authorityKey: "grant.exercise.REG-01-A",
              contentClass: "QCTP_ORIGINAL",
            },
            fields: {
              contentClass: "qctp_original",
              controlledContentAuthorityKey: "grant.exercise.REG-01-A",
              surface: "mirror",
              rawObservationLockedBeforeInterpretation: true,
            },
          }}
        />
      </dl>,
    );

    const origin = screen
      .getByText("Originating template / tool")
      .closest("div");
    expect(origin).not.toBeNull();
    expect(origin).toHaveTextContent("Learn to See: Two Equal Circles");
    expect(origin).toHaveTextContent(
      "Template/tool class: QCTP original (QCTP_ORIGINAL)",
    );
    expect(origin).toHaveTextContent(
      /Your observation, interpretation, and result remain user evidence/u,
    );
    expect(origin?.querySelector(".content-class-badge")).toBeNull();

    const structured = screen.getByText("Structured fields").closest("div");
    const serialized = structured?.querySelector("pre");
    expect(serialized).toHaveTextContent('"surface": "mirror"');
    expect(serialized).toHaveTextContent(
      '"rawObservationLockedBeforeInterpretation": true',
    );
    expect(serialized).not.toHaveTextContent("contentClass");
    expect(serialized).not.toHaveTextContent("controlledContentAuthorityKey");
    expect(container.querySelector(".content-class-badge")).toBeNull();
  });

  it("shows ordinary user fields without inventing a template origin", () => {
    render(
      <dl>
        <UserRecordStructuredFields
          record={{ fields: { outcome: "The target was visible." } }}
        />
      </dl>,
    );

    expect(
      screen.queryByText("Originating template / tool"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/The target was visible/u)).toBeInTheDocument();
  });

  it("renders only a registry-validated source-track reference as controlled origin", () => {
    const { rerender } = render(
      <dl>
        <UserRecordStructuredFields
          record={{
            contentRef: {
              authorityKey: "grant.exercise.REG-01-A",
              contentClass: "QCTP_ORIGINAL",
            },
            fields: {
              sourceTrackRef: sourceTrackReferenceFor(
                "robert-edward-grant",
                "REG-01-A",
              ),
              rawObservation: "Two circles overlap.",
            },
          }}
        />
      </dl>,
    );

    const controlledOrigin = screen
      .getByText("Controlled source-track origin")
      .closest("div");
    expect(controlledOrigin).toHaveAttribute(
      "data-source-track-origin",
      "robert-edward-grant",
    );
    expect(controlledOrigin).toHaveTextContent("REG-01 — Learn to See");
    expect(controlledOrigin).toHaveTextContent("Released controlled scope");
    expect(
      screen.getByText("Structured fields").closest("div"),
    ).not.toHaveTextContent("sourceTrackRef");

    rerender(
      <dl>
        <UserRecordStructuredFields
          record={{
            fields: {
              sourceTrackRef: sourceTrackReferenceFor(
                "robert-edward-grant",
                "REG-01-A",
              ),
            },
          }}
        />
      </dl>,
    );
    expect(
      screen.queryByText("Controlled source-track origin"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Structured fields").closest("div"),
    ).toHaveTextContent("Robert Edward Grant");

    rerender(
      <dl>
        <UserRecordStructuredFields
          record={{
            contentRef: {
              authorityKey: "grant.exercise.REG-01-A",
              contentClass: "QCTP_ORIGINAL",
            },
            fields: {
              sourceTrackRef: {
                trackId: "robert-edward-grant",
                trackLabel: "User supplied authority claim",
              },
            },
          }}
        />
      </dl>,
    );
    expect(
      screen.queryByText("Controlled source-track origin"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Structured fields").closest("div"),
    ).toHaveTextContent("User supplied authority claim");
  });

  it("shows a recoverable legacy hold without a live status claim", () => {
    const { container } = render(
      <dl>
        <UserRecordStructuredFields
          record={{
            controlledContentHold: {
              status: "HELD",
              code: "UNMAPPED_LEGACY_CONTENT_CLASS",
              authorityKey: "campbell.exercise.TC-01-POSSIBILITY-LEDGER",
              rawValue: "mystery_class",
              message:
                "UNMAPPED_LEGACY_CONTENT_CLASS: campbell.exercise.TC-01-POSSIBILITY-LEDGER (mystery_class). No data changed.",
            },
            fields: {
              sourceTrack: "thomas-campbell",
              exerciseId: "TC-01-POSSIBILITY-LEDGER",
              contentClass: "mystery_class",
              userVisibleNote: "Preserve this observation.",
            },
          }}
        />
      </dl>,
    );

    const hold = screen
      .getByText("Controlled-content recovery hold")
      .closest("div");
    expect(hold).toHaveAttribute(
      "data-controlled-content-hold",
      "UNMAPPED_LEGACY_CONTENT_CLASS",
    );
    expect(hold).toHaveTextContent(
      "campbell.exercise.TC-01-POSSIBILITY-LEDGER",
    );
    expect(hold).toHaveTextContent("Original value: mystery_class");
    expect(hold).toHaveTextContent(
      /Recovery export remains available.*Editing and validated import stay blocked/u,
    );
    expect(hold).toHaveTextContent("No data was changed.");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector(".content-class-badge")).toBeNull();

    const structured = screen.getByText("Structured fields").closest("div");
    expect(structured?.querySelector("pre")).toHaveTextContent(
      '"userVisibleNote": "Preserve this observation."',
    );
    expect(structured?.querySelector("pre")).not.toHaveTextContent(
      "mystery_class",
    );
  });
});

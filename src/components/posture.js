import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./status.css";

const Posture = ({ onLoaded }) => {
  const [osPostureChecks, setOsPostureChecks] = useState([]);
  const [securityKey, setSecurityKey] = useState(null);
  const [crowdstrikeStatus, setCrowdstrikeStatus] = useState(null);
  const [osStatus, setOsStatus] = useState({ message: "", passed: false });
  const [warpEnabled, setWarpEnabled] = useState(null);
  const [tooltipStyles, setTooltipStyles] = useState({});
  // A: Use the variable (if it's part of future logic)
  setErrorMessage('An error occurred');


  const tooltipTriggerRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log("Posture: Fetching data...");

        // Fetch WARP status
        const traceResponse = await fetch(
          "https://www.cloudflare.com/cdn-cgi/trace"
        );
        const traceText = await traceResponse.text();
        const warpStatus = traceText.includes("warp=on");
        setWarpEnabled(warpStatus);

        if (!warpStatus) {
          setSecurityKey(null);
          setCrowdstrikeStatus(null);
          setOsStatus({
            message: "Posture information unavailable, please enable WARP",
            passed: false,
          });
          if (onLoaded) onLoaded(); // Notify parent that loading is complete
          return;
        }

        // Fetch user details
        const response = await fetch("/api/userdetails");
        const data = await response.json();

        /*
        Note that this looks strictly for the presence/use of "swk" (Proof of possession of a software-secured key)
        */

        const securityKeyInUse = data.identity?.amr?.includes("swk") || false;
        setSecurityKey(
          securityKeyInUse
            ? "Security Key in Use"
            : "Security Key is not in Use"
        );

        /*
        This may not be applicable to your environment, requires that Crowdstrike as a posture source be added and rules configured.
        */

        // CrowdStrike Check
        const postureRules = data.posture?.result || {};
        let crowdstrikePassed = false;

        for (const rule of Object.values(postureRules)) {
          if (rule.type === "crowdstrike_s2s" && rule.success) {
            crowdstrikePassed = true;
            break;
          }
        }

        setCrowdstrikeStatus(
          crowdstrikePassed
            ? "CrowdStrike posture check successful"
            : "CrowdStrike posture check failed"
        );

        /*
        This also requires that rules exist for min-max values for Operating system versions
        https://developers.cloudflare.com/cloudflare-one/identity/devices/warp-client-checks/os-version/#enable-the-os-version-check
        */

        // OS Posture Check
        let relevantRules = [];
        let allConstraintsPassed = true;

        for (const rule of Object.values(postureRules)) {
          if (rule.type === "os_version") {
            relevantRules.push({
              name: rule.rule_name,
              success: rule.success,
              description: rule.description || "No description available",
              checked: rule.hasOwnProperty("check"),
              isMinConstraint: rule.rule_name
                .toLowerCase()
                .includes("min constraint"),
              isPatch: rule.rule_name.toLowerCase().includes("patch"),
            });

            if ((rule.isMinConstraint || rule.isPatch) && !rule.success) {
              allConstraintsPassed = false;
            }
          }
        }

        // Empty OS checks - For niece devices like chromeOS
        if (relevantRules.length === 0) {
          relevantRules.push({
            name: "OS Version Check",
            success: false,
            description:
              "No relevant OS version rules found for this device type",
            checked: false,
          });
          allConstraintsPassed = false;
        }

        setOsPostureChecks(relevantRules);

        // Set OS Status Message
        setOsStatus({
          message: allConstraintsPassed
            ? "Operating system up to date"
            : "Operating system update required",
          passed: allConstraintsPassed,
        });

        console.log("Posture: Data fetch complete.");
      } catch (error) {
        console.error("Posture: Error fetching data:", error);
        // setErrorMessage("Error fetching posture data. Please try again later.");
      } finally {
        if (onLoaded) onLoaded(); // Notify parent that loading is complete
      }
    };

    fetchData();
  }, [onLoaded]);

  // Allow hover-over of the OS results to see detailed information, useful for debugging the rules
  const handleMouseEnter = () => {
    if (tooltipTriggerRef.current) {
      const rect = tooltipTriggerRef.current.getBoundingClientRect();
      setTooltipStyles({
        top: rect.bottom + window.scrollY + 5,
        left: rect.left + window.scrollX,
      });
    }
  };

  const handleMouseLeave = () => {
    setTooltipStyles({});
  };

  const allPassed =
    warpEnabled &&
    securityKey === "Security Key in Use" &&
    crowdstrikeStatus?.includes("successful") &&
    osStatus.passed;

  return (
    <div className={allPassed ? "card-normal" : "card-error"}>
      {warpEnabled ? (
        <>
          <h2 className="text-xl font-semibold mb-4">
            Device Posture Requirements
          </h2>
          <ul className="mb-4 space-y-4">
            {/* Security Key Status */}
            <li className="info-item">
              <span
                className={`icon ${
                  securityKey === "Security Key in Use"
                    ? "check-icon"
                    : "cross-icon"
                }`}
              ></span>
              <span>{securityKey}</span>
            </li>

            {/* CrowdStrike Status */}
            <li className="info-item">
              <span
                className={`icon ${
                  crowdstrikeStatus?.includes("successful")
                    ? "check-icon"
                    : "cross-icon"
                }`}
              ></span>
              <span>{crowdstrikeStatus}</span>
            </li>

            {/* OS status */}
            <li
              className="info-item relative"
              ref={tooltipTriggerRef}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <span
                className={`icon ${
                  osStatus.passed ? "check-icon" : "cross-icon"
                }`}
              ></span>
              <span>{osStatus.message}</span>
              {tooltipStyles.top &&
                createPortal(
                  <div
                    className="tooltip"
                    style={{
                      position: "absolute",
                      ...tooltipStyles,
                      zIndex: 9999,
                    }}
                  >
                    <ul>
                      {osPostureChecks.map((check, index) => (
                        <li key={index} className="info-item">
                          <span
                            className={`icon ${
                              check.success ? "check-icon" : "cross-icon"
                            }`}
                          ></span>
                          <span>{`${check.name}: ${
                            check.checked
                              ? check.success
                                ? "Compliant"
                                : "Non-compliant"
                              : "Rule was not checked"
                          }`}</span>
                        </li>
                      ))}
                    </ul>
                  </div>,
                  document.body
                )}
            </li>
          </ul>
        </>
      ) : (
        <div className="text-black p-5">
          <span className="icon cross-icon mr-2"></span>
          Please enable WARP to view device posture information.
        </div>
      )}
      {errorMessage && <p className="text-red mt-4">{errorMessage}</p>}
    </div>
  );
};

export default Posture;

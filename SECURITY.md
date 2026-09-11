# Security reporting

> `FINAL_FROZEN_PUBLICATION_CANDIDATE / ROUTE_SELECTED_NOT_YET_ENABLED / NOT_PUBLISHED`

Do not disclose a suspected vulnerability, exploit detail, Credential, API key, personal information, customer data, or other sensitive information in a public issue.

```text
SECURITY_PRIVATE_DESTINATION = GITHUB_PRIVATE_VULNERABILITY_REPORTING
TARGET_REPOSITORY = wi-tcom/KOKOROSAKU
SECURITY_ROUTE_OPERATIONALLY_VERIFIED = NO
```

After the public Repository is created, its administrator must enable GitHub Private Vulnerability Reporting. Reporters must use the Repository **Security** area and select **Report a vulnerability**. The report is routed through GitHub Security Advisories rather than a public Issue.

If **Report a vulnerability** is not available, do not disclose details publicly. There is no public fallback. Publication must stop until Private Vulnerability Reporting is enabled and read back successfully.

```text
PUBLIC_ISSUE_SECURITY_DETAILS = PROHIBITED
FALLBACK_PRIVATE_ENDPOINT = NONE
ENABLEMENT_REQUIRED_BEFORE_PUBLICATION = YES
```

Submitting a report does not create a paid-support entitlement, SLA, response-time commitment, Human Approval, or Authority.

This newly authored publication document is `CC BY 4.0` only at this exact publication-manifest path. Trademark rights are not granted.

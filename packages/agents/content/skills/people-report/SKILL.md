---
name: people-report
description: Generate headcount, attrition, diversity, or org health reports from employee data. Use when pulling a headcount snapshot, analyzing turnover trends, preparing diversity metrics, or assessing span of control and flight risk.
user-invocable: true
---

# People report

Generate HR analytics reports from employee data provided as CSV paste or file path.

**Announce at start:**

- With `--report-type`: "Using people-report to generate a {report type} report."
- Without `--report-type`: "Using people-report to generate an HR analytics report."

## Arguments

- `--report-type` (optional): Comma-separated list of report types to generate. Valid values: `headcount`, `attrition`, `diversity`, `org-health`. When omitted, prompt the user interactively.

## Report types

- **Headcount:** Current org snapshot (by team, location, level, tenure)
- **Attrition:** Turnover analysis (voluntary/involuntary, by team, trends over time)
- **Diversity:** Representation metrics (by level, team, pipeline, promotion rates)
- **Org health:** Span of control, management layers, team sizes, flight risk indicators

## Process

### 1. Select report type

If `--report-type` is provided, use the specified types. Skip the prompt.

If `--report-type` is omitted, present the four report types and ask the user to choose one or more. The report the user wants is a taste call, so the options have no strength markers:

> ---
>
> **Action items**
>
> Which report type(s) would you like? Select one or more.
>
> 1. Headcount: Org snapshot by team, location, level, tenure
> 2. Attrition: Turnover analysis by team, trends
> 3. Diversity: Representation metrics by level, team, pipeline
> 4. Org health: Span of control, layers, team sizes, flight risk

<!-- include: ../_partials/action-items.md / -->

### 2. Collect data

Ask the user to provide employee data:

> Paste your employee data below, or provide a file path and I'll read it.

Accept CSV, TSV, or any tabular format. If the user provides a file path, read it using the available file-read tool.

### 3. Infer columns

Examine the column headers and infer their meaning. Map each column to a recognized field based on common naming patterns (e.g., `Dept`, `Department`, `Team`, `Business Unit` all map to the department/team concept).

**If any column mapping is ambiguous**, confirm with the user before proceeding. One item per ambiguous column, so the user can resolve them all in a single reply:

> Two of your columns have no unambiguous mapping.
>
> ---
>
> **Action items**
>
> **Q1:** `DoT`: Is this date of termination or date of transfer? 🤔
>
> **Q2:** `L`: Is this level or location? 🤔

Do not guess silently on ambiguous columns.

After resolving all columns, confirm the mapping with the user. The mapping itself is prose; only the confirmation is an item:

> I found {N} rows and mapped your columns:
>
> - `Dept` → department
> - `Hire Date` → start date
> - `Emp ID` → employee identifier
> - ...
>
> ---
>
> **Action items**
>
> Proceed with this column mapping? 👍🏼👎🏼

Proceed only after the user confirms.

### 4. Validate minimum fields

The minimum required fields are:

- **Employee identifier** (name, ID, or email)
- **Department/team** (department, team, business unit, or org)

If the dataset contains column headers but zero data rows, stop and tell the user: "Your data contains headers but no employee records."

If either minimum field is missing, stop and tell the user:

> I need at least an employee identifier (name, ID, or email) and a department/team column to generate any report. Your data appears to be missing: {missing fields}.

### 5. Assess field coverage per report type

For each requested report type, check which analyses are possible given the available fields. If a report type cannot be fully produced, note the limitations and proceed with what is available.

#### Headcount

| Analysis           | Required fields                             |
| ------------------ | ------------------------------------------- |
| By department/team | department                                  |
| By location        | location (city, office, region, or country) |
| By level           | level, grade, or band                       |
| By tenure          | start date or hire date                     |

#### Attrition

| Analysis                 | Required fields                          |
| ------------------------ | ---------------------------------------- |
| Overall attrition rate   | start date, end date or termination date |
| Voluntary vs involuntary | termination reason or termination type   |
| By department            | department + dates                       |
| Trend over time          | dates with enough historical range       |
| Regrettable attrition    | performance rating or termination reason |

#### Diversity

| Analysis                 | Required fields                                       |
| ------------------------ | ----------------------------------------------------- |
| Representation by group  | demographic fields (gender, ethnicity, age)           |
| By level                 | demographics + level                                  |
| By team                  | demographics + department                             |
| Promotion rates by group | demographics + promotion date or level change history |
| Pay equity               | demographics + compensation                           |

#### Org health

| Analysis          | Required fields                                                                     |
| ----------------- | ----------------------------------------------------------------------------------- |
| Span of control   | manager field (manager name, manager ID, or reports-to)                             |
| Management layers | manager field (to build hierarchy)                                                  |
| Team sizes        | department + manager                                                                |
| Flight risk       | tenure, performance, compensation, recent promotion (more fields = stronger signal) |

After assessing coverage, inform the user what will and won't be included:

- **Available analyses:** Headcount by department, by level, by tenure
- **Not available (missing fields):** Headcount by location; add a `location` column to enable this

### 6. Analyze and generate report

For each requested report type, compute the relevant metrics from the available data.

**Statistical approach:**

1. Understand the underlying business question the report type addresses
2. Compute counts, rates, distributions, and trends as appropriate
3. Flag outliers and notable patterns
4. Provide context: A 15% attrition rate means different things in different industries

**Handling limitations:**

- When the dataset is small, note statistical limitations (e.g., "with only 12 employees in Engineering, percentage breakdowns may not be meaningful")
- When date ranges are short, note that trend analysis is limited
- When fields are sparse (many null values), note the completeness rate

### 7. Present output

Use the following template for each report type. If multiple report types are requested, use a top-level `# People report ({Date})` header with each type as a `##` section beneath it. For a single report type, use the `##` header directly.

```markdown
## People report: {Type} ({Date})

### Executive summary

{2-3 key takeaways in plain language}

### Key metrics

| Metric   | Value   | Trend          |
| -------- | ------- | -------------- |
| {metric} | {value} | {trend or n/a} |

### Detailed analysis

{Tables, breakdowns, and narrative. Group by the most relevant dimension for the report type.}

### Recommendations

- {Data-driven recommendation}
- {Data-driven recommendation}

### Methodology

- **Data source:** {description of what was provided}
- **Record count:** {N} employees
- **Date range:** {range if applicable}
- **Limitations:** {missing fields, small sample sizes, sparse data}
```

## Key principles

- **Adaptive, not rigid**: Work with whatever data is available; never refuse to run because of missing optional fields
- **Confirm ambiguity**: When column mappings are unclear, ask rather than assume
- **Context over numbers**: Raw metrics without interpretation are not useful; always explain what the numbers mean
- **Note limitations**: Be transparent about what the data can and cannot support
- **No external calls**: All analysis is performed on user-provided data; there are no HRIS or messaging integrations

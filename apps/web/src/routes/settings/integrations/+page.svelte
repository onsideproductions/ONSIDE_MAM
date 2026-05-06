<script>
  import SettingsPlaceholder from '$components/ui/SettingsPlaceholder.svelte';
</script>

<svelte:head>
  <title>Integrations - Settings - ONSIDE MAM</title>
</svelte:head>

<SettingsPlaceholder
  title="Integrations"
  description="Connect ONSIDE MAM to other tools your team uses."
  features={[
    'Slack: post asset updates and AI summaries to channels',
    'Adobe Premiere Pro panel for direct asset import',
    'DaVinci Resolve project linking',
    'Zapier / Webhooks for custom automations',
    'Storage providers beyond Wasabi (S3, R2, B2)',
  ]}
/>

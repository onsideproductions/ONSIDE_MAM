<script>
  import SettingsPlaceholder from '$components/ui/SettingsPlaceholder.svelte';
</script>

<svelte:head>
  <title>Shares - Settings - ONSIDE MAM</title>
</svelte:head>

<SettingsPlaceholder
  title="Shares"
  description="Set the default colours for all Shares created in this account. These default colours will apply to new Shares only."
  features={[
    'Default share background and accent colour',
    'Default expiry windows and password requirements',
    'Default download permission for shared assets',
    'Watermark and download branding presets',
  ]}
/>

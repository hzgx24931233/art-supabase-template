<template>
  <PersonnelWorkspace
    department-mode
    :department-permissions="{
      add: 'MdmProductionDepartment:Add',
      edit: 'MdmProductionDepartment:Edit',
      delete: 'MdmProductionDepartment:Delete',
      view: 'MdmProductionDepartment:View',
      import: 'MdmProductionDepartment:Import',
      export: 'MdmProductionDepartment:Export',
      enable: 'MdmProductionDepartment:Enable',
      disable: 'MdmProductionDepartment:Disable'
    }"
  />
</template>

<script setup lang="ts">
  import PersonnelWorkspace from '../personnel/index.vue'

  defineOptions({ name: 'MdmProductionDepartment' })
</script>

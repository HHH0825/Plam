Component({
  properties:{progress:Object,footnote:String},
  data:{pawFailed:false,dayNumber:'',isDayCount:false},
  observers:{
    'progress.value'(value) {
      // Separate typography only; the original date presentation remains authoritative.
      const count=/^(\d+) 天$/.exec(value || '')
      this.setData({isDayCount:!!count,dayNumber:count ? count[1] : ''})
    }
  },
  methods:{pawFailed(){this.setData({pawFailed:true})}}
})

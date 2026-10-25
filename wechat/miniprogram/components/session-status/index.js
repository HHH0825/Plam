Component({properties:{blocked:Boolean,busy:Boolean,message:String},methods:{noop(){},retry(){this.triggerEvent('retry')}}})

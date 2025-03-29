import DialogBackground from "@/components/Dialog/DialogBackground";
import DialogForm from "@/components/Dialog/DialogForm";
import DateTimePicker from "@/components/Inputs/DateTimePicker";
import Input from "@/components/Inputs/Input";
import SelectInputGroup from "@/components/Inputs/SelectInputGroup";
import ServicesSelect from "@/components/Inputs/ServicesSelect";
import VoucherInput from "@/components/Inputs/VoucherInput";
import SelectedService from "@/components/ui/cashier/SelectedService";

export default function CashierModal() {
  return (
    <DialogBackground>
      <DialogForm>
        <h1 className=" text-center text-2xl font-bold uppercase tracking-widest">
          directed Beautyfeel
        </h1>
        <Input label="Customer" />
        <Input label="E-mail" />
        <div className="flex justify-between mt-8  w-[90%] mx-auto">
          <SelectInputGroup
            label="Service Type"
            name="serviceType"
            id="serviceType"
            options={[
              { id: "01", title: "Single" },
              { id: "02", title: "Set" },
            ]}
            valueKey="id"
            labelKey="title"
          />

          <SelectInputGroup
            label="Service Type"
            name="serviceType"
            id="serviceType"
            options={[
              { id: "01", title: "Now" },
              { id: "02", title: "Later" },
            ]}
            valueKey="id"
            labelKey="title"
          />
        </div>
        <DateTimePicker />
        <ServicesSelect />
        <div className="flex mt-8 justify-between w-[90%] mx-auto ">
          <VoucherInput />
          <SelectInputGroup
            label="Payment Method"
            options={[
              { id: "PM01", title: "Cash" },
              { id: "PM02", title: "E-wallet" },
              { id: "PM03", title: "Bank" },
            ]}
          />
        </div>
        <div className="overflow-y-auto shadow-custom max-h-[200px] p-2 lg:min-h-[100px] border-2  relative border-customDarkPink  w-[90%] mx-auto mt-8 rounded-md">
          {/*   <p className="font-medium tracking-widest absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1 inline-block whitespace-nowrap">
            No Transactions Yet
          </p> */}
          <SelectedService name="Nail Polish #1" quantity={1} price={499} />
          <SelectedService name="Nail Polish #1" quantity={1} price={499} />

          <SelectedService name="Nail Polish #1" quantity={1} price={499} />
          <SelectedService name="Nail Polish #1" quantity={1} price={499} />
          <SelectedService name="Nail Polish #1" quantity={1} price={499} />
          <SelectedService name="Nail Polish #1" quantity={1} price={499} />

          <SelectedService name="Nail Polish #1" quantity={1} price={499} />
        </div>
        <div className="w-[90%] mt-8   flex flex-col  mx-auto">
          <div className="flex justify-between">
            <p>
              <span className="font-medium">Total Discount:</span>&#x20B1;500
            </p>
            <p>
              <span className="font-medium">Subtotal:</span>&#x20B1;500
            </p>
          </div>
          <p>
            <span className="font-medium">Grand Total:</span>&#x20B1; 500
          </p>
        </div>
        <div className="w-[90%] mx-auto flex justify-around mt-8">
          <button
            type="button"
            className="hover:bg-customDarkPink text-customDarkPink hover:text-customOffWhite transition-all duration-150 min-w-[100px] py-2 border-2 border-customDarkPink rounded-md"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="min-w-[100px] hover:bg-transparent hover:text-customDarkPink transition-all duration-150 py-2 border-2 border-customDarkPink bg-customDarkPink font-medium text-white rounded-md"
          >
            Confirm
          </button>
        </div>
      </DialogForm>
    </DialogBackground>
  );
}

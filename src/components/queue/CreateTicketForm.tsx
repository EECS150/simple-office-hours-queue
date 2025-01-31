import { InfoIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Radio,
  RadioGroup,
  Switch,
  Text,
  Textarea,
  Tooltip,
  useToast,
} from "@chakra-ui/react";
import { PersonalQueue, TicketType } from "@prisma/client";
import { Select } from "chakra-react-select";
import Router from "next/router";
import { useEffect, useState } from "react";
import { TicketWithNames } from "../../server/trpc/router/ticket";
import {
  STARTER_CHECKOFF_TICKET_DESCRIPTION,
  STARTER_CONCEPTUAL_TICKET_DESCRIPTION,
  STARTER_DEBUGGING_TICKET_DESCRIPTION,
} from "../../utils/constants";
import { trpc } from "../../utils/trpc";
import { getTicketUrl, uppercaseFirstLetter } from "../../utils/utils";
import ConfirmPublicToggleModal from "../modals/ConfirmPublicToggleModal";

interface Assignment {
  id: number;
  label: string;
  value: string;
}

interface Location {
  id: number;
  label: string;
  value: string;
}

interface CreateTicketFormProps {
  arePublicTicketsEnabled: boolean;
  personalQueue?: PersonalQueue;
  isEditingTicket?: boolean;
  // Existing ticket is used to prepopulate the form when editing a ticket
  existingTicket?: TicketWithNames;
  setExistingTicket?: (ticket: TicketWithNames) => void;
}

const CreateTicketForm = (props: CreateTicketFormProps) => {
  const {
    arePublicTicketsEnabled,
    personalQueue,
    isEditingTicket,
    existingTicket,
    setExistingTicket,
  } = props;
  const [ticketType, setTicketType] = useState<TicketType | undefined>(
    existingTicket?.ticketType,
  );
  const [description, setDescription] = useState<string>(
    existingTicket?.description ?? "",
  );
  const [locationDescription, setLocationDescription] = useState<string>(
    existingTicket?.locationDescription ?? "",
  );
  const [assignmentOptions, setAssignmentOptions] = useState<Assignment[]>([]);
  const [locationOptions, setLocationOptions] = useState<Location[]>([]);
  const [isPublicModalOpen, setIsPublicModalOpen] = useState<boolean>(false);
  const [isPublic, setIsPublic] = useState<boolean>(
    existingTicket?.isPublic ?? false,
  );
  const [isButtonLoading, setIsButtonLoading] = useState<boolean>(false);
  const [assignment, setAssignment] = useState<Assignment | undefined>(
    existingTicket
      ? {
          id: existingTicket.assignmentId,
          label: existingTicket.assignmentName,
          value: existingTicket.assignmentName,
        }
      : undefined,
  );
  const [location, setLocation] = useState<Location | undefined>(
    existingTicket
      ? {
          id: existingTicket.locationId,
          label: existingTicket.locationName,
          value: existingTicket.locationName,
        }
      : undefined,
  );
  const toast = useToast();

  // When a property of the ticket changes, update the existing ticket if it exists
  useEffect(() => {
    if (existingTicket && setExistingTicket) {
      setExistingTicket({
        ...existingTicket,
        description,
        locationDescription,
        assignmentId: assignment?.id ?? existingTicket.assignmentId,
        assignmentName: assignment?.label ?? existingTicket.assignmentName,
        locationId: location?.id ?? existingTicket.locationId,
        locationName: location?.label ?? existingTicket.locationName,
        ticketType: ticketType ?? existingTicket.ticketType,
        isPublic,
      });
    }
  }, [
    description,
    locationDescription,
    assignment,
    location,
    ticketType,
    isPublic,
    existingTicket,
    setExistingTicket,
  ]);

  const createTicketMutation = trpc.ticket.createTicket.useMutation();
  trpc.admin.getActiveAssignments.useQuery(undefined, {
    refetchOnWindowFocus: false,
    onSuccess: (data) => {
      setAssignmentOptions(
        data.map(
          (assignment) =>
            ({
              label: assignment.name,
              value: assignment.name,
              id: assignment.id,
            }) as Assignment,
        ),
      );
    },
  });

  trpc.admin.getActiveLocations.useQuery(undefined, {
    refetchOnWindowFocus: false,
    onSuccess: (data) => {
      setLocationOptions(
        data.map(
          (location) =>
            ({
              label: location.name,
              value: location.name,
              id: location.id,
            }) as Location,
        ),
      );
    },
  });

  const cooldownPeriod = trpc.admin.getCoolDownTime.useQuery(undefined, {
    refetchOnWindowFocus: false,
  }).data;

  const handleTicketTypeChange = (newVal: TicketType) => {
    setTicketType(newVal);
    if (newVal === TicketType.DEBUGGING) {
      setDescription(STARTER_DEBUGGING_TICKET_DESCRIPTION);
      setIsPublic(false);
    } else if (newVal === TicketType.CONCEPTUAL) {
      setDescription(STARTER_CONCEPTUAL_TICKET_DESCRIPTION);
      if (arePublicTicketsEnabled) {
        setIsPublic(true);
      }
    } else {
      setDescription(STARTER_CHECKOFF_TICKET_DESCRIPTION);
      setIsPublic(false);
    }
  };

  const handleTogglePublic = () => {
    if (ticketType === TicketType.CONCEPTUAL && isPublic) {
      setIsPublicModalOpen(true);
      return;
    }
    setIsPublic(!isPublic);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isEditingTicket) {
      // Edit ticket has it's own submit handler
      return;
    }

    if (!assignment || !ticketType) {
      toast({
        title: "Error",
        description: "Please select an assignment and location",
        status: "error",
        position: "top-right",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    // If description has "[this test]" or "[this concept]" in it, toast and return
    if (
      description.includes("[this test]") ||
      description.includes("[this concept]")
    ) {
      toast({
        title: "Error",
        description:
          "Please replace [this concept] or [this test] with the the specific concept or test",
        status: "error",
        position: "top-right",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    // Prevents spamming the button
    setIsButtonLoading(true);

    await createTicketMutation
      .mutateAsync({
        description: description.trim(),
        assignmentId: assignment.id,
        locationId: 1,
        locationDescription: locationDescription.trim(),
        personalQueueName: personalQueue?.name,
        ticketType,
        isPublic,
      })
      .then((ticket) => {
        if (!ticket) {
          const coolDownText = cooldownPeriod
            ? `You must wait ${cooldownPeriod} minutes since your last ticket was resolved.`
            : "";
          toast({
            title: "Error",
            description: `Could not create ticket. You may already have a ticket open. If not, refresh and try again. ${coolDownText}`,
            status: "error",
            position: "top-right",
            duration: 10000,
            isClosable: true,
          });
          return;
        }
        setDescription("");
        // Resets the select options
        setAssignment("" as unknown as Assignment);
        setLocation("" as unknown as Location);
        toast({
          title: "Ticket created",
          description: "Your help request has been created",
          status: "success",
          duration: 3000,
          isClosable: true,
          position: "top-right",
        });
        Router.push(getTicketUrl(ticket.id));
      });

    setIsButtonLoading(false);
  };

  return (
    <Box
      p={8}
      pt={2}
      width="full"
      borderWidth={1}
      borderRadius={8}
      boxShadow="lg"
    >
      <Box my={4} textAlign="left">
        <form onSubmit={onSubmit}>
          <FormControl isRequired>
            <Flex>
              <FormLabel>Ticket Type</FormLabel>
              <RadioGroup onChange={handleTicketTypeChange} value={ticketType}>
                {Object.keys(TicketType).map((type) => (
                  <Radio mr={2} key={type} value={type}>
                    {uppercaseFirstLetter(type)}
                  </Radio>
                ))}
              </RadioGroup>
            </Flex>
          </FormControl>
          <FormControl isRequired isDisabled={ticketType === undefined}>
            <FormLabel>Description</FormLabel>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              name="description"
              size="md"
              maxLength={1000}
            />
          </FormControl>
          <FormControl mt={6} isRequired>
            <FormLabel>Assignment</FormLabel>
            <Select
              value={assignment}
              onChange={(val) => setAssignment(val ?? undefined)}
              options={assignmentOptions}
            />
          </FormControl>
          <FormControl mt={6} isRequired>
            <FormLabel>Lab Station (c111-??) </FormLabel>
            <NumberInput 
              value={locationDescription}
              onChange={(v) => setLocationDescription(v)}
              defaultValue={15}
              min={1}
              max={20}
            >
              <NumberInputField />
              <NumberInputStepper>
                <NumberIncrementStepper />
                <NumberDecrementStepper />
              </NumberInputStepper>
            </NumberInput>
          </FormControl>
          <FormControl
            mt={6}
            display="flex"
            hidden={!arePublicTicketsEnabled}
            isDisabled={
              ticketType === TicketType.DEBUGGING || ticketType === undefined
            }
          >
            <FormLabel>
              Public
              <Tooltip
                hasArrow
                label="Public tickets can be joined by other students. This is great for group work 
               or conceptual questions! If your ticket is public, we are more likely to 
               help you for a longer time."
                bg="gray.300"
                color="black"
              >
                <InfoIcon ml={2} mb={1} />
              </Tooltip>
            </FormLabel>
            <Switch isChecked={isPublic} mt={1} onChange={handleTogglePublic} />
          </FormControl>
          <Button
            hidden={isEditingTicket}
            type="submit"
            width="full"
            mt={4}
            colorScheme="whatsapp"
            isLoading={isButtonLoading}
          >
            Request Help
          </Button>
        </form>
      </Box>
      <ConfirmPublicToggleModal
        isModalOpen={isPublicModalOpen}
        setIsModalOpen={setIsPublicModalOpen}
        handleConfirm={() => {
          setIsPublicModalOpen(false);
          setIsPublic(false);
        }}
      />
    </Box>
  );
};

export default CreateTicketForm;
